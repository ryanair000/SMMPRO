import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const message = formData.get('message') || '';
    const image = formData.get('image'); // This is a File object if present
    const scheduledTime = formData.get('scheduledPublishTime'); // Unix timestamp (optional)

    const PAGE_ID = process.env.NEXT_PUBLIC_FB_PAGE_ID;
    const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
    const USER_TOKEN = process.env.FB_USER_ACCESS_TOKEN;
    const ADMIN_GROUP_ID = '1497786931895263';

    if (!PAGE_ID || !PAGE_TOKEN || PAGE_ID === 'your_page_id_here') {
      return NextResponse.json({ 
        error: 'Facebook page credentials are not configured in .env.local' 
      }, { status: 500 });
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

    const response = await fetch(endpoint, {
      method: 'POST',
      body: fbFormData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Page Error: ${data.error?.message || 'Failed to post'}`);
    }

    const results = [{ target: 'Page', id: data.id, status: 'Success' }];

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

        const gRes = await fetch(groupEndpoint, {
          method: 'POST',
          body: groupFormData
        });
        const gData = await gRes.json();
        
        if (!gRes.ok) {
          results.push({ target: 'Admin Group', status: `Failed: ${gData.error?.message}` });
        } else {
          results.push({ target: 'Admin Group', id: gData.id, status: 'Success' });
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
