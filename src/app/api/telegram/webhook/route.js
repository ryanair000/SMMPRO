import { NextResponse } from 'next/server';
import { CHEZAHUB_CAPTION_PROMPT } from '@/lib/captionPrompt';

export const maxDuration = 60;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
const FB_PAGE_ID = process.env.NEXT_PUBLIC_FB_PAGE_ID?.trim();
const FB_PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN?.trim();
const FB_USER_TOKEN = process.env.FB_USER_ACCESS_TOKEN?.trim();
const ADMIN_GROUP_ID = process.env.FB_ADMIN_GROUP_ID?.trim();

async function sendMessage(chatId, text) {
  if (!chatId) return;
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

export async function POST(request) {
  let chatId = null;
  try {
    const update = await request.json();
    chatId = update.message?.chat?.id;
    
    if (!update.message || !update.message.photo) {
      if (update.message?.text) {
        await sendMessage(chatId, "Welcome to SMM Pro. Send me a gaming image, and I will generate a ChezaHub caption and post it.");
      }
      return NextResponse.json({ ok: true });
    }

    await sendMessage(chatId, "Image received. Generating Chezahub caption...");

    const photos = update.message.photo;
    const bestPhoto = photos[photos.length - 1]; 
    
    const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${bestPhoto.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error("Failed to get file from Telegram");

    const filePath = fileData.result.file_path;
    const imageRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`);
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    const base64Data = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg';
    
    const promptText = CHEZAHUB_CAPTION_PROMPT;

    if (!OPENAI_KEY) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }]
      })
    });
    const oaiData = await oaiRes.json();
    const caption = oaiData.choices?.[0]?.message?.content?.trim();

    if (!caption) throw new Error(oaiData.error?.message || "OpenAI failed to generate a caption.");

    await sendMessage(chatId, `Caption generated:\n\n${caption}\n\nPublishing...`);

    const blob = new Blob([imageBuffer], { type: mimeType });
    const fileName = 'telegram_photo.jpg';

    // Post to Page
    const pageFormData = new FormData();
    pageFormData.append('message', caption);
    pageFormData.append('access_token', FB_PAGE_TOKEN);
    pageFormData.append('source', blob, fileName);

    const pageRes = await fetch(`https://graph.facebook.com/v20.0/${FB_PAGE_ID}/photos`, { method: 'POST', body: pageFormData });
    const pageData = await pageRes.json();

    if (pageData.error) throw new Error(`Page Error: ${pageData.error.message}`);

    let finalMsg = `Successfully posted to Chezahub Page. (ID: ${pageData.id})`;

    if (ADMIN_GROUP_ID && FB_USER_TOKEN) {
      const groupFormData = new FormData();
      groupFormData.append('message', caption);
      groupFormData.append('access_token', FB_USER_TOKEN);
      groupFormData.append('source', blob, fileName);

      const groupRes = await fetch(`https://graph.facebook.com/v20.0/${ADMIN_GROUP_ID}/photos`, { method: 'POST', body: groupFormData });
      const groupData = await groupRes.json();

      if (groupData.error) {
        finalMsg += `\nFailed to post to Admin Group: ${groupData.error.message}`;
      } else {
        finalMsg += `\nSuccessfully crossposted to Admin Group.`;
      }
    }

    await sendMessage(chatId, finalMsg);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error(error);
    if (chatId) {
       await sendMessage(chatId, `Error: ${error.message}`);
    }
    return NextResponse.json({ ok: true }); 
  }
}
