import { NextResponse } from 'next/server';
import { getAccountCredentials } from '@/lib/socialAccounts';

function jsonError(message, status, details = null) {
  return NextResponse.json({ error: message, details }, { status });
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
  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData
  });
  const data = await readFacebookResponse(response);

  if (!response.ok || data.error) {
    const message = data.error?.message || `Facebook ${target} request failed`;
    const code = data.error?.code;
    const type = data.error?.type;

    return {
      ok: false,
      error: `${target} Error: ${message}`,
      details: { code, type, status: response.status }
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
    const message = data.error?.message || 'Instagram container status request failed';
    return { ok: false, error: `Instagram Error: ${message}`, details: { status: response.status } };
  }

  return { ok: true, data };
}

async function postToInstagram({ igUserId, accessToken, caption, imageUrl }) {
  const createFormData = new FormData();
  createFormData.append('image_url', imageUrl);
  if (caption) createFormData.append('caption', caption);
  createFormData.append('access_token', accessToken);

  const createResult = await postToFacebook(
    graphUrl(`/${igUserId}/media`),
    createFormData,
    'Instagram'
  );

  if (!createResult.ok) {
    return createResult;
  }

  const creationId = createResult.data.id;
  let isFinished = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const statusResult = await getInstagramContainerStatus(creationId, accessToken);
    if (!statusResult.ok) {
      return statusResult;
    }

    const statusCode = statusResult.data.status_code;
    if (statusCode === 'FINISHED') {
      isFinished = true;
      break;
    }

    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      return {
        ok: false,
        error: `Instagram Error: media container ${statusCode.toLowerCase()}`,
        details: statusResult.data
      };
    }

    await sleep(2500);
  }

  if (!isFinished) {
    return {
      ok: false,
      error: 'Instagram Error: media container was not ready before timeout',
      details: { creationId }
    };
  }

  const publishFormData = new FormData();
  publishFormData.append('creation_id', creationId);
  publishFormData.append('access_token', accessToken);

  return postToFacebook(
    graphUrl(`/${igUserId}/media_publish`),
    publishFormData,
    'Instagram'
  );
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const message = formData.get('message') || '';
    const image = formData.get('image'); // This is a File object if present
    const imageUrl = formData.get('imageUrl')?.toString().trim() || '';
    const scheduledTime = formData.get('scheduledPublishTime'); // Unix timestamp (optional)
    const publishFacebook = formData.get('publishFacebook') !== 'false';
    const publishInstagram = formData.get('publishInstagram') !== 'false';
    const accountId = formData.get('accountId')?.toString() || 'chezahub';

    const { account, credentials } = getAccountCredentials(accountId);
    const PAGE_ID = credentials.pageId;
    const PAGE_TOKEN = credentials.pageToken;
    const USER_TOKEN = credentials.userToken;
    const IG_USER_ID = credentials.igUserId;

    if (!PAGE_ID || !PAGE_TOKEN || PAGE_ID === 'your_page_id_here') {
      return jsonError(`${account.name} Facebook page credentials are not configured in .env.local`, 500);
    }

    if (!message.trim() && !image && !imageUrl) {
      return jsonError('Add a caption or image before publishing.', 400);
    }

    if (!publishFacebook && !publishInstagram) {
      return jsonError('Choose at least one publishing target.', 400);
    }

    const results = [];
    let effectiveImageUrl = imageUrl; // may be updated after FB post

    if (publishFacebook) {
      const endpoint = image || effectiveImageUrl
        ? graphUrl(`/${PAGE_ID}/photos`)
        : graphUrl(`/${PAGE_ID}/feed`);

      const fbFormData = new FormData();
      if (message) fbFormData.append('message', message);
      fbFormData.append('access_token', PAGE_TOKEN);

      if (scheduledTime) {
        fbFormData.append('published', 'false');
        fbFormData.append('scheduled_publish_time', scheduledTime);
      }

      if (image) {
        fbFormData.append('source', image);
      } else if (effectiveImageUrl) {
        fbFormData.append('url', effectiveImageUrl);
      }

      const pageResult = await postToFacebook(endpoint, fbFormData, 'Page');
      if (!pageResult.ok) {
        return jsonError(pageResult.error, 502, pageResult.details);
      }

      results.push({ target: `${account.name} Facebook`, id: pageResult.data.id, status: 'Success' });

      // If a file was uploaded with no manual imageUrl, auto-fetch the public CDN URL
      // from Facebook so we can reuse it for Instagram — no manual URL input needed.
      if (image && !effectiveImageUrl && pageResult.data.id && publishInstagram && IG_USER_ID && !scheduledTime) {
        try {
          const photoId = pageResult.data.id;
          const photoRes = await fetch(
            `${graphUrl(`/${photoId}`)}?fields=images&access_token=${PAGE_TOKEN}`
          );
          const photoData = await photoRes.json();
          // images is sorted largest-first; pick the first (highest resolution)
          const cdnUrl = photoData?.images?.[0]?.source;
          if (cdnUrl) {
            effectiveImageUrl = cdnUrl;
          }
        } catch {
          // If we can't get the CDN URL, Instagram will be silently skipped below
        }
      }
    }

    if (publishInstagram && IG_USER_ID) {
      if (scheduledTime) {
        // Silent skip — Instagram scheduling not supported
      } else if (!effectiveImageUrl) {
        // Silent skip — no image URL available (text-only post or CDN fetch failed)
      } else if (!USER_TOKEN) {
        results.push({ target: `${account.name} Instagram`, status: `Failed: ${account.env.userToken} is missing - required for Instagram posting` });
      } else {
        // Instagram Graph API requires the USER access token, not the PAGE token
        const instagramResult = await postToInstagram({
          igUserId: IG_USER_ID,
          accessToken: USER_TOKEN,
          caption: message,
          imageUrl: effectiveImageUrl
        });

        if (!instagramResult.ok) {
          results.push({ target: `${account.name} Instagram`, status: `Failed: ${instagramResult.error}` });
        } else {
          results.push({ target: `${account.name} Instagram`, id: instagramResult.data.id, status: 'Success' });
        }
      }
    }

    return NextResponse.json({ success: true, account: account.id, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
