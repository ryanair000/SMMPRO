import { NextResponse } from 'next/server';
import { getCaptionPrompt } from '@/lib/captionPrompt';

export const maxDuration = 60; // 60s timeout limit to prevent Vercel 504 errors

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
    const { imageBase64, accountId } = await request.json();
    const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 });
    }

    if (!OPENAI_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 });
    }

    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
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
