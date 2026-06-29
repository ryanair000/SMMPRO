import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { CHEZAHUB_CAPTION_PROMPT } from '@/lib/captionPrompt';
import { getAccountCredentials } from '@/lib/socialAccounts';
import { assertContentLength, rateLimit } from '@/lib/rateLimit';

export const maxDuration = 60;

const MAX_TELEGRAM_BODY_BYTES = 1024 * 1024;
const MAX_TELEGRAM_IMAGE_BYTES = 10 * 1024 * 1024;

function safeEqual(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function getAllowedChatIds() {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function isAllowedChat(chatId) {
  if (!chatId) return false;
  return getAllowedChatIds().includes(chatId.toString());
}

async function sendMessage(telegramApi, chatId, text) {
  if (!chatId) return;
  await fetch(`${telegramApi}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

export async function POST(request) {
  let chatId = null;
  let telegramApi = null;
  try {
    const sizeError = assertContentLength(request, MAX_TELEGRAM_BODY_BYTES);
    if (sizeError) return sizeError;

    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    const requestSecret = request.headers.get('x-telegram-bot-api-secret-token') || '';

    if (!webhookSecret || !safeEqual(requestSecret, webhookSecret)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const rateLimitError = rateLimit(request, {
      scope: 'telegram-webhook',
      limit: 60,
      windowMs: 60 * 1000
    });
    if (rateLimitError) return rateLimitError;

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_TELEGRAM_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'Request body is too large' }, { status: 413 });
    }

    let update;
    try {
      update = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    chatId = update.message?.chat?.id;

    if (!isAllowedChat(chatId)) {
      return NextResponse.json({ ok: true });
    }

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const adminGroupId = process.env.FB_ADMIN_GROUP_ID?.trim();
    const { credentials } = getAccountCredentials('chezahub');

    if (!telegramToken || !openaiKey || !credentials.pageId || !credentials.pageToken) {
      return NextResponse.json({ ok: false, error: 'Webhook is not configured' }, { status: 500 });
    }

    telegramApi = `https://api.telegram.org/bot${telegramToken}`;
    
    if (!update.message || !update.message.photo) {
      if (update.message?.text) {
        await sendMessage(telegramApi, chatId, "Welcome to SMM Pro. Send me a gaming image, and I will generate a ChezaHub caption and post it.");
      }
      return NextResponse.json({ ok: true });
    }

    await sendMessage(telegramApi, chatId, "Image received. Generating Chezahub caption...");

    const photos = update.message.photo;
    const bestPhoto = photos[photos.length - 1]; 

    if (bestPhoto.file_size && bestPhoto.file_size > MAX_TELEGRAM_IMAGE_BYTES) {
      await sendMessage(telegramApi, chatId, "That image is too large. Please send an image under 10 MB.");
      return NextResponse.json({ ok: true });
    }
    
    const fileRes = await fetch(`${telegramApi}/getFile?file_id=${bestPhoto.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error("Failed to get file from Telegram");

    const filePath = fileData.result.file_path;
    const imageRes = await fetch(`https://api.telegram.org/file/bot${telegramToken}/${filePath}`);
    const imageArrayBuffer = await imageRes.arrayBuffer();
    if (imageArrayBuffer.byteLength > MAX_TELEGRAM_IMAGE_BYTES) {
      await sendMessage(telegramApi, chatId, "That image is too large. Please send an image under 10 MB.");
      return NextResponse.json({ ok: true });
    }

    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    const base64Data = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg';
    
    const promptText = CHEZAHUB_CAPTION_PROMPT;

    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }]
      })
    });
    const oaiData = await oaiRes.json();
    const caption = oaiData.choices?.[0]?.message?.content?.trim();

    if (!caption) throw new Error(oaiData.error?.message || "OpenAI failed to generate a caption.");

    await sendMessage(telegramApi, chatId, `Caption generated:\n\n${caption}\n\nPublishing...`);

    const blob = new Blob([imageBuffer], { type: mimeType });
    const fileName = 'telegram_photo.jpg';

    // Post to Page
    const pageFormData = new FormData();
    pageFormData.append('message', caption);
    pageFormData.append('access_token', credentials.pageToken);
    pageFormData.append('source', blob, fileName);

    const pageRes = await fetch(`https://graph.facebook.com/v20.0/${credentials.pageId}/photos`, { method: 'POST', body: pageFormData });
    const pageData = await pageRes.json();

    if (pageData.error) throw new Error(`Page Error: ${pageData.error.message}`);

    let finalMsg = `Successfully posted to Chezahub Page. (ID: ${pageData.id})`;

    if (adminGroupId && credentials.userToken) {
      const groupFormData = new FormData();
      groupFormData.append('message', caption);
      groupFormData.append('access_token', credentials.userToken);
      groupFormData.append('source', blob, fileName);

      const groupRes = await fetch(`https://graph.facebook.com/v20.0/${adminGroupId}/photos`, { method: 'POST', body: groupFormData });
      const groupData = await groupRes.json();

      if (groupData.error) {
        finalMsg += `\nFailed to post to Admin Group: ${groupData.error.message}`;
      } else {
        finalMsg += `\nSuccessfully crossposted to Admin Group.`;
      }
    }

    await sendMessage(telegramApi, chatId, finalMsg);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error(error);
    if (chatId && telegramApi) {
       await sendMessage(telegramApi, chatId, `Error: ${error.message}`);
    }
    return NextResponse.json({ ok: true }); 
  }
}
