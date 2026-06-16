import { NextResponse } from 'next/server';

function jsonError(message, status, details = null) {
  return NextResponse.json({ error: message, details }, { status });
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

export async function POST(request) {
  try {
    const formData = await request.formData();
    const message = formData.get('message') || '';
    const image = formData.get('image'); // This is a File object if present
    const scheduledTime = formData.get('scheduledPublishTime'); // Unix timestamp (optional)

    const PAGE_ID = process.env.NEXT_PUBLIC_FB_PAGE_ID?.trim();
    const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN?.trim();
    const USER_TOKEN = process.env.FB_USER_ACCESS_TOKEN?.trim();
    const ADMIN_GROUP_ID = '1497786931895263';

    if (!PAGE_ID || !PAGE_TOKEN || PAGE_ID === 'your_page_id_here') {
      return jsonError('Facebook page credentials are not configured in .env.local', 500);
    }

    if (!message.trim() && !image) {
      return jsonError('Add a caption or image before publishing.', 400);
    }

    const endpoint = image 
      ? `https://graph.facebook.com/v20.0/${PAGE_ID}/photos`
      : `https://graph.facebook.com/v20.0/${PAGE_ID}/feed`;

    const fbFormData = new FormData();
    if (message) fbFormData.append('message', message);
    fbFormData.append('access_token', PAGE_TOKEN);

    if (scheduledTime) {
      fbFormData.append('published', 'false');
      fbFormData.append('scheduled_publish_time', scheduledTime);
    }
    
    let blob = null;
    let fileName = 'image.jpg';
    if (image) {
      const arrayBuffer = await image.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      blob = new Blob([buffer], { type: image.type });
      fileName = image.name || 'image.jpg';
      fbFormData.append('source', blob, fileName);
    }

    const pageResult = await postToFacebook(endpoint, fbFormData, 'Page');
    if (!pageResult.ok) {
      return jsonError(pageResult.error, 502, pageResult.details);
    }

    const results = [{ target: 'Page', id: pageResult.data.id, status: 'Success' }];

    // Crosspost to the Admin Group
    if (!USER_TOKEN || USER_TOKEN === 'your_user_token_here') {
      results.push({ target: 'Admin Group', status: 'Failed: FB_USER_ACCESS_TOKEN missing in .env.local' });
    } else {
      try {
        const groupEndpoint = image 
          ? `https://graph.facebook.com/v20.0/${ADMIN_GROUP_ID}/photos`
          : `https://graph.facebook.com/v20.0/${ADMIN_GROUP_ID}/feed`;
          
        const groupFormData = new FormData();
        if (message) groupFormData.append('message', message);
        groupFormData.append('access_token', USER_TOKEN);
        
        if (scheduledTime) {
          groupFormData.append('published', 'false');
          groupFormData.append('scheduled_publish_time', scheduledTime);
        }

        if (image && blob) {
          groupFormData.append('source', blob, fileName);
        }

        const groupResult = await postToFacebook(groupEndpoint, groupFormData, 'Admin Group');
        if (!groupResult.ok) {
          results.push({ target: 'Admin Group', status: `Failed: ${groupResult.error}` });
        } else {
          results.push({ target: 'Admin Group', id: groupResult.data.id, status: 'Success' });
        }
      } catch (e) {
        results.push({ target: 'Admin Group', status: `Error: ${e.message}` });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
