import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  beginIdempotentPublish,
  completeIdempotentPublish,
  failIdempotentPublish
} from '@/lib/idempotency';
import {
  collectImageUrls,
  getPublishMode,
  MAX_CAROUSEL_ITEMS,
  MIN_CAROUSEL_ITEMS,
  validatePublicImageUrls
} from '@/lib/publishRequest';
import { assertContentLength, rateLimit } from '@/lib/rateLimit';
import { SOCIAL_ACCOUNTS, getAccountCredentials } from '@/lib/socialAccounts';
import { uploadPublicImage } from '@/lib/publicImage';
import { enqueueScheduledPublishes } from '@/lib/scheduledPublishes';
import {
  MAX_RECURRENCE_OCCURRENCES,
  RECURRENCE_FREQUENCIES,
  normalizeRecurrence
} from '@/lib/scheduleRecurrence';

const MAX_FORM_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 2200;
const MIN_SCHEDULE_DELAY_SECONDS = 10 * 60;

function jsonError(message, status, details = null, headers = undefined) {
  return NextResponse.json({ error: message, details }, { status, headers });
}

function graphUrl(path) {
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v20.0';
  return `https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`;
}

async function readFacebookResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text || response.statusText || 'Unknown Facebook response' } };
  }
}

async function postToFacebook(endpoint, formData, target) {
  const response = await fetch(endpoint, { method: 'POST', body: formData });
  const data = await readFacebookResponse(response);
  if (!response.ok || data.error) {
    return {
      ok: false,
      error: `${target} Error: ${data.error?.message || `HTTP ${response.status}`}`,
      details: {
        code: data.error?.code,
        type: data.error?.type,
        status: response.status
      }
    };
  }
  return { ok: true, data };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getInstagramContainerStatus(creationId, accessToken) {
  const url = new URL(graphUrl(`/${creationId}`));
  url.searchParams.set('fields', 'status_code,status');
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url);
  const data = await readFacebookResponse(response);

  if (!response.ok || data.error) {
    return {
      ok: false,
      error: `Instagram Error: ${data.error?.message || 'container status request failed'}`,
      details: { status: response.status }
    };
  }
  return { ok: true, data };
}

async function waitForInstagramContainer(creationId, accessToken) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await getInstagramContainerStatus(creationId, accessToken);
    if (!result.ok) return result;
    if (result.data.status_code === 'FINISHED') return result;
    if (['ERROR', 'EXPIRED'].includes(result.data.status_code)) {
      return {
        ok: false,
        error: `Instagram Error: media container ${result.data.status_code.toLowerCase()}`,
        details: result.data
      };
    }
    await sleep(2500);
  }
  return {
    ok: false,
    error: 'Instagram Error: media container was not ready before timeout',
    details: { creationId }
  };
}

async function postToInstagram({ igUserId, accessToken, caption, imageUrl }) {
  const createForm = new FormData();
  createForm.append('image_url', imageUrl);
  if (caption) createForm.append('caption', caption);
  createForm.append('access_token', accessToken);
  const created = await postToFacebook(graphUrl(`/${igUserId}/media`), createForm, 'Instagram');
  if (!created.ok) return created;

  const ready = await waitForInstagramContainer(created.data.id, accessToken);
  if (!ready.ok) return ready;
  const publishForm = new FormData();
  publishForm.append('creation_id', created.data.id);
  publishForm.append('access_token', accessToken);
  const published = await postToFacebook(
    graphUrl(`/${igUserId}/media_publish`),
    publishForm,
    'Instagram'
  );
  if (!published.ok) return published;
  return { ok: true, data: { ...published.data, containerId: created.data.id } };
}

async function postStoryToInstagram({ igUserId, accessToken, imageUrl }) {
  const createForm = new FormData();
  createForm.append('media_type', 'STORIES');
  createForm.append('image_url', imageUrl);
  createForm.append('access_token', accessToken);
  const created = await postToFacebook(
    graphUrl(`/${igUserId}/media`),
    createForm,
    'Instagram Story'
  );
  if (!created.ok) return created;

  const ready = await waitForInstagramContainer(created.data.id, accessToken);
  if (!ready.ok) return ready;
  const publishForm = new FormData();
  publishForm.append('creation_id', created.data.id);
  publishForm.append('access_token', accessToken);
  const published = await postToFacebook(
    graphUrl(`/${igUserId}/media_publish`),
    publishForm,
    'Instagram Story'
  );
  if (!published.ok) return published;
  return { ok: true, data: { ...published.data, containerId: created.data.id } };
}

async function postCarouselToInstagram({ igUserId, accessToken, caption, imageUrls }) {
  const childIds = [];
  for (let index = 0; index < imageUrls.length; index += 1) {
    const form = new FormData();
    form.append('image_url', imageUrls[index]);
    form.append('is_carousel_item', 'true');
    form.append('access_token', accessToken);
    const child = await postToFacebook(
      graphUrl(`/${igUserId}/media`),
      form,
      `Instagram carousel item ${index + 1}`
    );
    if (!child.ok) return child;
    const ready = await waitForInstagramContainer(child.data.id, accessToken);
    if (!ready.ok) return ready;
    childIds.push(child.data.id);
  }

  const carouselForm = new FormData();
  carouselForm.append('media_type', 'CAROUSEL');
  carouselForm.append('children', childIds.join(','));
  if (caption) carouselForm.append('caption', caption);
  carouselForm.append('access_token', accessToken);
  const carousel = await postToFacebook(
    graphUrl(`/${igUserId}/media`),
    carouselForm,
    'Instagram carousel'
  );
  if (!carousel.ok) return carousel;

  const ready = await waitForInstagramContainer(carousel.data.id, accessToken);
  if (!ready.ok) return ready;
  const publishForm = new FormData();
  publishForm.append('creation_id', carousel.data.id);
  publishForm.append('access_token', accessToken);
  const published = await postToFacebook(
    graphUrl(`/${igUserId}/media_publish`),
    publishForm,
    'Instagram carousel'
  );
  if (!published.ok) return published;
  return {
    ok: true,
    data: { ...published.data, containerId: carousel.data.id, childIds }
  };
}

async function postCarouselToFacebook({ pageId, accessToken, caption, imageUrls, scheduledTime }) {
  const mediaIds = [];
  for (let index = 0; index < imageUrls.length; index += 1) {
    const photoForm = new FormData();
    photoForm.append('url', imageUrls[index]);
    photoForm.append('published', 'false');
    photoForm.append('access_token', accessToken);
    const photo = await postToFacebook(
      graphUrl(`/${pageId}/photos`),
      photoForm,
      `Facebook carousel item ${index + 1}`
    );
    if (!photo.ok) return photo;
    mediaIds.push(photo.data.id);
  }

  const feedForm = new FormData();
  if (caption) feedForm.append('message', caption);
  mediaIds.forEach((mediaId, index) => {
    feedForm.append(`attached_media[${index}]`, JSON.stringify({ media_fbid: mediaId }));
  });
  if (scheduledTime) {
    feedForm.append('published', 'false');
    feedForm.append('scheduled_publish_time', scheduledTime);
  }
  feedForm.append('access_token', accessToken);
  const published = await postToFacebook(
    graphUrl(`/${pageId}/feed`),
    feedForm,
    'Facebook carousel'
  );
  if (!published.ok) return published;
  return { ok: true, data: { ...published.data, mediaIds } };
}

function isImageFile(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function';
}

export async function POST(request) {
  let claimedKey = '';
  try {
    const authError = requireAuth(request);
    if (authError) return authError;
    const sizeError = assertContentLength(request, MAX_FORM_BYTES);
    if (sizeError) return sizeError;
    const rateLimitError = rateLimit(request, { scope: 'post', limit: 20, windowMs: 60_000 });
    if (rateLimitError) return rateLimitError;

    const formData = await request.formData();
    const message = formData.get('message')?.toString() || '';
    const candidateImage = formData.get('image');
    const image = isImageFile(candidateImage) ? candidateImage : null;
    const scheduledTime = formData.get('scheduledPublishTime')?.toString() || '';
    const recurrenceFrequency = formData.get('recurrenceFrequency')?.toString() || 'none';
    const recurrenceCount = formData.get('recurrenceCount')?.toString() || '1';
    const requestedFacebook = formData.get('publishFacebook') !== 'false';
    const requestedInstagram = formData.get('publishInstagram') !== 'false';
    const accountId = formData.get('accountId')?.toString() || 'chezahub';
    const idempotencyKey = formData.get('idempotencyKey')?.toString().trim() || '';
    let imageUrls;
    try {
      imageUrls = collectImageUrls(formData);
    } catch (error) {
      return jsonError(error.message, 400);
    }
    const publishMode = getPublishMode(formData, imageUrls);

    if (!SOCIAL_ACCOUNTS.some(account => account.id === accountId)) {
      return jsonError('Unknown social account.', 400);
    }
    const { account, credentials } = getAccountCredentials(accountId);
    const publishFacebook = requestedFacebook && account.platforms?.facebook !== false;
    const publishInstagram = requestedInstagram && account.platforms?.instagram !== false;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonError(`Caption must be ${MAX_MESSAGE_LENGTH} characters or fewer.`, 400);
    }
    if (!message.trim() && !image && imageUrls.length === 0) {
      return jsonError('Add a caption or image before publishing.', 400);
    }
    if (!publishFacebook && !publishInstagram) {
      return jsonError('Choose at least one publishing target.', 400);
    }
    if (publishMode === 'story' && (publishFacebook || !publishInstagram)) {
      return jsonError('Instagram Stories can only publish to Instagram.', 400);
    }
    if (publishMode === 'story' && (imageUrls.length !== 1 || image)) {
      return jsonError('An Instagram Story requires one public image URL.', 400);
    }
    if (image && (!image.type?.startsWith('image/') || image.size > MAX_IMAGE_BYTES)) {
      return jsonError('Uploaded image must be an image no larger than 10 MB.', 413);
    }
    if (image && imageUrls.length > 1) {
      return jsonError('Use public image URLs for multi-image publishing.', 400);
    }
    try {
      validatePublicImageUrls(imageUrls, {
        requireHttps:
          publishInstagram &&
          (publishMode === 'carousel' || publishMode === 'story')
      });
    } catch (error) {
      return jsonError(error.message, 400);
    }
    if (publishMode === 'carousel' &&
        (imageUrls.length < MIN_CAROUSEL_ITEMS || imageUrls.length > MAX_CAROUSEL_ITEMS)) {
      return jsonError(
        `Carousels require ${MIN_CAROUSEL_ITEMS}-${MAX_CAROUSEL_ITEMS} ordered images.`,
        400
      );
    }
    if (!RECURRENCE_FREQUENCIES.includes(recurrenceFrequency)) {
      return jsonError('Repeat must be none, daily, or weekly.', 400);
    }
    const recurrence = normalizeRecurrence(recurrenceFrequency, recurrenceCount);
    if (recurrenceFrequency !== 'none') {
      const requestedCount = Number.parseInt(recurrenceCount, 10);
      if (!Number.isFinite(requestedCount) || requestedCount < 1 ||
          requestedCount > MAX_RECURRENCE_OCCURRENCES) {
        return jsonError(
          `Recurring schedules require 1-${MAX_RECURRENCE_OCCURRENCES} occurrences.`,
          400
        );
      }
      if (!scheduledTime) {
        return jsonError('Recurring schedules need a first scheduled time.', 400);
      }
    }
    if (scheduledTime && publishMode === 'carousel') {
      return jsonError('Carousel scheduling is not supported.', 400);
    }
    if (scheduledTime) {
      const scheduleUnix = Number(scheduledTime);
      if (!Number.isFinite(scheduleUnix) ||
          scheduleUnix < Date.now() / 1000 + MIN_SCHEDULE_DELAY_SECONDS) {
        return jsonError('Scheduled time must be a Unix timestamp at least 10 minutes ahead.', 400);
      }
    }

    const { pageId, pageToken, userToken, igUserId } = credentials;
    if (publishFacebook && (!pageId || !pageToken || pageId === 'your_page_id_here')) {
      return jsonError(`${account.name} Facebook credentials are not configured.`, 500);
    }
    if (publishInstagram && (!igUserId || !userToken)) {
      return jsonError(`${account.name} Instagram credentials are not configured.`, 500);
    }

    const requestDescriptor = {
      accountId,
      message,
      imageUrls,
      hasUploadedImage: Boolean(image),
      publishFacebook,
      publishInstagram,
      scheduledTime,
      publishMode,
      recurrenceFrequency: recurrence.frequency,
      recurrenceCount: recurrence.count
    };
    const idempotency = await beginIdempotentPublish(idempotencyKey, requestDescriptor);
    if (idempotency.mode === 'conflict') {
      return jsonError('Idempotency key was already used for a different request.', 409);
    }
    if (idempotency.mode === 'in_progress') {
      return jsonError(
        'A request with this idempotency key is already publishing.',
        503,
        null,
        { 'Retry-After': '30' }
      );
    }
    if (idempotency.mode === 'replay') {
      return NextResponse.json(idempotency.response, {
        headers: { 'X-Idempotent-Replay': 'true' }
      });
    }
    claimedKey = idempotency.mode === 'claimed' ? idempotency.key : '';

    const results = [];
    let effectiveImageUrl = imageUrls[0] || '';
    if ((scheduledTime || (publishInstagram && !publishFacebook)) &&
        !effectiveImageUrl && image) {
      effectiveImageUrl = await uploadPublicImage(image);
    }

    if (scheduledTime) {
      if (publishInstagram && !effectiveImageUrl) {
        const body = { error: 'Scheduled Instagram publishing requires a public image URL.' };
        await failIdempotentPublish(claimedKey, body);
        return NextResponse.json(body, { status: 400 });
      }

      const platforms = [
        publishFacebook && 'facebook',
        publishInstagram && 'instagram'
      ].filter(Boolean);
      const scheduled = await enqueueScheduledPublishes({
        sourceKey: idempotencyKey,
        accountId,
        message,
        imageUrl: effectiveImageUrl,
        publishMode,
        platforms,
        firstScheduledUnix: Number(scheduledTime),
        recurrenceFrequency: recurrence.frequency,
        recurrenceCount: recurrence.count
      });
      for (const platform of platforms) {
        const isInstagram = platform === 'instagram';
        results.push({
          target: `${account.name} ${isInstagram ? 'Instagram' : 'Facebook'}${
            isInstagram && publishMode === 'story' ? ' Story' : ''
          }`,
          status: 'Scheduled',
          scheduledCount: scheduled.occurrenceCount,
          firstScheduledFor: scheduled.firstScheduledFor,
          lastScheduledFor: scheduled.lastScheduledFor,
          jobIds: scheduled.jobs
            .filter(job => job.platform === platform)
            .map(job => job.jobId)
        });
      }

      const body = {
        success: true,
        account: account.id,
        mode: publishMode,
        recurrence: {
          frequency: recurrence.frequency,
          count: recurrence.count
        },
        results
      };
      await completeIdempotentPublish(claimedKey, body);
      return NextResponse.json(body);
    }

    if (publishFacebook) {
      let facebookResult;
      if (publishMode === 'carousel') {
        facebookResult = await postCarouselToFacebook({
          pageId,
          accessToken: pageToken,
          caption: message,
          imageUrls,
          scheduledTime
        });
      } else {
        const endpoint = image || effectiveImageUrl
          ? graphUrl(`/${pageId}/photos`)
          : graphUrl(`/${pageId}/feed`);
        const pageForm = new FormData();
        if (message) pageForm.append('message', message);
        pageForm.append('access_token', pageToken);
        if (scheduledTime) {
          pageForm.append('published', 'false');
          pageForm.append('scheduled_publish_time', scheduledTime);
        }
        if (image) pageForm.append('source', image);
        else if (effectiveImageUrl) pageForm.append('url', effectiveImageUrl);
        facebookResult = await postToFacebook(endpoint, pageForm, 'Facebook Page');
      }

      if (!facebookResult.ok) {
        const body = { error: facebookResult.error, details: facebookResult.details };
        await failIdempotentPublish(claimedKey, body);
        return NextResponse.json(body, { status: 502 });
      }
      results.push({
        target: `${account.name} Facebook${publishMode === 'carousel' ? ' Carousel' : ''}`,
        id: facebookResult.data.id,
        mediaIds: facebookResult.data.mediaIds,
        status: 'Success'
      });

      if (image && !effectiveImageUrl && facebookResult.data.id && publishInstagram && !scheduledTime) {
        try {
          const photoUrl = new URL(graphUrl(`/${facebookResult.data.id}`));
          photoUrl.searchParams.set('fields', 'images');
          photoUrl.searchParams.set('access_token', pageToken);
          const photoResponse = await fetch(photoUrl);
          const photoData = await photoResponse.json();
          effectiveImageUrl = photoData?.images?.[0]?.source || '';
        } catch {
          effectiveImageUrl = '';
        }
      }
    }

    if (publishInstagram) {
      if (scheduledTime) {
        results.push({
          target: `${account.name} Instagram`,
          status: 'Failed: Instagram scheduling is handled by Socio, not SMMPRO.'
        });
      } else if (publishMode !== 'carousel' && !effectiveImageUrl) {
        results.push({
          target: `${account.name} Instagram`,
          status: 'Failed: Instagram needs a public image URL.'
        });
      } else {
        const instagramResult = publishMode === 'story'
          ? await postStoryToInstagram({
              igUserId,
              accessToken: userToken,
              imageUrl: effectiveImageUrl
            })
          : publishMode === 'carousel'
            ? await postCarouselToInstagram({
              igUserId,
              accessToken: userToken,
              caption: message,
              imageUrls
            })
            : await postToInstagram({
                igUserId,
                accessToken: userToken,
                caption: message,
                imageUrl: effectiveImageUrl
              });
        results.push(instagramResult.ok
          ? {
              target: `${account.name} Instagram${
                publishMode === 'carousel'
                  ? ' Carousel'
                  : publishMode === 'story'
                    ? ' Story'
                    : ''
              }`,
              id: instagramResult.data.id,
              containerId: instagramResult.data.containerId,
              mediaIds: instagramResult.data.childIds,
              status: 'Success'
            }
          : {
              target: `${account.name} Instagram`,
              status: `Failed: ${instagramResult.error}`,
              details: instagramResult.details
            });
      }
    }

    const failedResult = results.find(result => result.status?.startsWith('Failed:'));
    if (idempotencyKey && results.length === 1 && failedResult) {
      const body = {
        error: failedResult.status.replace(/^Failed:\s*/, ''),
        account: account.id,
        mode: publishMode,
        results
      };
      await failIdempotentPublish(claimedKey, body);
      return NextResponse.json(body, { status: 502 });
    }

    const body = { success: true, account: account.id, mode: publishMode, results };
    await completeIdempotentPublish(claimedKey, body);
    return NextResponse.json(body);
  } catch (error) {
    const body = { error: error instanceof Error ? error.message : 'Publishing failed.' };
    try {
      await failIdempotentPublish(claimedKey, body);
    } catch {
      // Preserve the original publishing error if persistence is also unavailable.
    }
    return NextResponse.json(body, { status: 500 });
  }
}
