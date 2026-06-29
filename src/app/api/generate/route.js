import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getCaptionPrompt } from '@/lib/captionPrompt';
import { assertContentLength, rateLimit } from '@/lib/rateLimit';

export const maxDuration = 60; // 60s timeout limit to prevent Vercel 504 errors
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,/;

function normalizeCaption(caption) {
  return caption
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(request) {
  try {
    const authError = requireAuth(request);
    if (authError) return authError;

    const sizeError = assertContentLength(request, MAX_JSON_BYTES);
    if (sizeError) return sizeError;

    const rateLimitError = rateLimit(request, {
      scope: 'generate',
      limit: 30,
      windowMs: 60 * 1000
    });
    if (rateLimitError) return rateLimitError;

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_JSON_BYTES) {
      return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { imageBase64, accountId } = payload;
    const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 });
    }

    if (!SUPPORTED_IMAGE_PATTERN.test(imageBase64)) {
      return NextResponse.json({ error: 'Use a PNG, JPG, JPEG, or WEBP image.' }, { status: 400 });
    }

    if (!OPENAI_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 });
    }

    const base64Data = imageBase64.replace(SUPPORTED_IMAGE_PATTERN, "");
    const mimeType = imageBase64.match(/^data:(image\/[a-z]+);base64,/)?.[1] || "image/jpeg";
    const promptText = getCaptionPrompt(accountId);

    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You write polished Facebook and Instagram captions. Preserve the requested line breaks exactly. Never return a single paragraph when a structured caption is requested.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
            ]
          }
        ]
      })
    });

    const oaiData = await oaiRes.json();
    const caption = normalizeCaption(oaiData.choices?.[0]?.message?.content || '');

    if (!caption) {
       throw new Error(oaiData.error?.message || 'OpenAI failed to generate a caption.');
    }

    return NextResponse.json({ caption });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
