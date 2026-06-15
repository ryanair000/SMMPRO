import { NextResponse } from 'next/server';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const FB_PAGE_ID = process.env.NEXT_PUBLIC_FB_PAGE_ID;
const FB_PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_USER_TOKEN = process.env.FB_USER_ACCESS_TOKEN;
const ADMIN_GROUP_ID = '1497786931895263';

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
    
    // Ignore updates that aren't messages with photos
    if (!update.message || !update.message.photo) {
      if (update.message?.text) {
        await sendMessage(chatId, "👋 Welcome to AutoPoster! Send me an image, and I will auto-caption and post it to Facebook for you.");
      }
      return NextResponse.json({ ok: true });
    }

    await sendMessage(chatId, "⏳ Image received! Generating AI caption...");

    // 1. Get image from Telegram
    const photos = update.message.photo;
    const bestPhoto = photos[photos.length - 1]; // highest resolution
    
    const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${bestPhoto.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error("Failed to get file from Telegram");

    const filePath = fileData.result.file_path;
    const imageRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`);
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    // Convert to base64 for AI
    const base64Data = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg';
    
    // 2. Generate Caption
    const promptText = "Extract any text from this image (OCR). Then, write an engaging World Cup football/soccer update for the Facebook page 'PlayMechi'. Format the caption professionally with a catchy hook, the main update/score/news from the image, and relevant World Cup hashtags (e.g., #WorldCup, #PlayMechi, #Football). Keep it exciting! CRITICAL: DO NOT use any markdown formatting like **asterisks** or bolding. Use plain text only. Only return the caption text without any extra conversation.";

    let caption = null;

    if (OR_KEY && OR_KEY !== 'your_openrouter_api_key_here') {
      try {
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3.5-flash',
            messages: [{ role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }]
          })
        });
        const orData = await orRes.json();
        if (orRes.ok && orData.choices?.[0]?.message?.content) caption = orData.choices[0].message.content.trim();
      } catch (err) { console.warn("OR failed"); }
    }

    if (!caption && GEMINI_KEY) {
      try {
        const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: base64Data } }] }] })
        });
        const gemData = await gemRes.json();
        if (gemRes.ok && gemData.candidates?.[0]?.content?.parts?.[0]?.text) caption = gemData.candidates[0].content.parts[0].text.trim();
      } catch (err) { console.warn("Gemini failed"); }
    }

    if (!caption) throw new Error("Failed to generate caption.");

    await sendMessage(chatId, `✨ Caption generated:\n\n${caption}\n\n🚀 Publishing to Facebook...`);

    // 3. Post to Facebook
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

    // Post to Group
    const groupFormData = new FormData();
    groupFormData.append('message', caption);
    groupFormData.append('access_token', FB_USER_TOKEN);
    groupFormData.append('source', blob, fileName);

    const groupRes = await fetch(`https://graph.facebook.com/v20.0/${ADMIN_GROUP_ID}/photos`, { method: 'POST', body: groupFormData });
    const groupData = await groupRes.json();

    let finalMsg = `✅ Successfully posted to PlayMechi Page! (ID: ${pageData.id})`;
    if (groupData.error) {
      finalMsg += `\n⚠️ But failed to post to Admin Group: ${groupData.error.message}`;
    } else {
      finalMsg += `\n✅ Successfully crossposted to Admin Group!`;
    }

    await sendMessage(chatId, finalMsg);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error(error);
    if (chatId) {
       await sendMessage(chatId, `❌ Error: ${error.message}`);
    }
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram so it doesn't retry
  }
}
