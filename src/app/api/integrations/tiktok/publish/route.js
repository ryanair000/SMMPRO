import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  beginIdempotentPublish,
  completeIdempotentPublish,
  failIdempotentPublish,
} from '@/lib/idempotency';
import { rateLimit } from '@/lib/rateLimit';
import { validatePublicImageUrls } from '@/lib/publishRequest';
import { initTikTokPhotoPost } from '@/lib/tiktok';

const MAX_TITLE_LENGTH = 120;
const MAX_CAPTION_LENGTH = 2200;
const MAX_IMAGES = 10;

function jsonError(message, status, headers = undefined) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(request) {
  let claimedKey = '';
  try {
    const authError = requireAuth(request);
    if (authError) return authError;
    const limited = rateLimit(request, { scope: 'tiktok-publish', limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const body = await request.json();
    const accountId = String(body.accountId || 'chezahub');
    const title = String(body.title || '').trim();
    const caption = String(body.caption || '').trim();
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.map(value => String(value).trim()).filter(Boolean)
      : [];
    const idempotencyKey = String(body.idempotencyKey || '').trim();

    if (accountId !== 'chezahub') {
      return jsonError('TikTok publishing is currently enabled for ChezaHub only.', 400);
    }
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return jsonError(`Title must be between 1 and ${MAX_TITLE_LENGTH} characters.`, 400);
    }
    if (caption.length > MAX_CAPTION_LENGTH) {
      return jsonError(`Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.`, 400);
    }
    if (imageUrls.length < 1 || imageUrls.length > MAX_IMAGES) {
      return jsonError(`TikTok posts require between 1 and ${MAX_IMAGES} images.`, 400);
    }
    try {
      validatePublicImageUrls(imageUrls, { requireHttps: true });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Invalid image URL.', 400);
    }

    const descriptor = {
      provider: 'tiktok',
      accountId,
      title,
      caption,
      imageUrls,
      autoAddMusic: true,
      brandOrganic: true,
    };
    const idempotency = await beginIdempotentPublish(idempotencyKey, descriptor);
    if (idempotency.mode === 'conflict') {
      return jsonError('Idempotency key was already used for a different request.', 409);
    }
    if (idempotency.mode === 'in_progress') {
      return jsonError('This TikTok post is already being created.', 503, {
        'Retry-After': '30',
      });
    }
    if (idempotency.mode === 'replay') {
      return NextResponse.json(idempotency.response, {
        headers: { 'X-Idempotent-Replay': 'true' },
      });
    }
    claimedKey = idempotency.mode === 'claimed' ? idempotency.key : '';

    const result = await initTikTokPhotoPost({ accountId, title, caption, imageUrls });
    const responseBody = {
      success: true,
      account: accountId,
      mode: imageUrls.length > 1 ? 'carousel' : 'single',
      results: [
        {
          target: `ChezaHub TikTok${imageUrls.length > 1 ? ' Photo Carousel' : ' Photo'}`,
          id: result.publishId,
          publishId: result.publishId,
          privacyLevel: result.privacyLevel,
          autoAddMusic: true,
          musicAlwaysOn: true,
          status: 'Processing',
        },
      ],
    };
    await completeIdempotentPublish(claimedKey, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    const responseBody = {
      error: error instanceof Error ? error.message : 'TikTok publishing failed.',
    };
    try {
      await failIdempotentPublish(claimedKey, responseBody);
    } catch {
      // Preserve the original TikTok error.
    }
    return NextResponse.json(responseBody, { status: 502 });
  }
}
