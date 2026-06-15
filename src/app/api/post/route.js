import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const message = formData.get('message') || '';
    const image = formData.get('image'); // This is a File object if present
    const targetGroups = formData.get('targetGroups') || '';

    const PAGE_ID = process.env.NEXT_PUBLIC_FB_PAGE_ID;
    const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
    const USER_TOKEN = process.env.FB_USER_ACCESS_TOKEN;

    if (!PAGE_ID || !PAGE_TOKEN || PAGE_ID === 'your_page_id_here') {
      return NextResponse.json({ 
        error: 'Facebook page credentials are not configured in .env.local' 
      }, { status: 500 });
    }

    const endpoint = image 
      ? `https://graph.facebook.com/v19.0/${PAGE_ID}/photos`
      : `https://graph.facebook.com/v19.0/${PAGE_ID}/feed`;

    const fbFormData = new FormData();
    if (message) fbFormData.append('message', message);
    fbFormData.append('access_token', PAGE_TOKEN);
    
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

    // Crosspost to Groups
    const groups = targetGroups.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    if (groups.length > 0) {
      if (!USER_TOKEN || USER_TOKEN === 'your_user_token_here') {
         results.push({ target: 'Groups', status: 'Failed: FB_USER_ACCESS_TOKEN missing in .env.local' });
      } else {
        for (const groupId of groups) {
          try {
            const groupEndpoint = image 
              ? `https://graph.facebook.com/v19.0/${groupId}/photos`
              : `https://graph.facebook.com/v19.0/${groupId}/feed`;
              
            const groupFormData = new FormData();
            if (message) groupFormData.append('message', message);
            groupFormData.append('access_token', USER_TOKEN);
            if (image && blob) {
              groupFormData.append('source', blob, fileName);
            }

            const gRes = await fetch(groupEndpoint, {
              method: 'POST',
              body: groupFormData
            });
            const gData = await gRes.json();
            
            if (!gRes.ok) {
              results.push({ target: `Group ${groupId}`, status: `Failed: ${gData.error?.message}` });
            } else {
              results.push({ target: `Group ${groupId}`, id: gData.id, status: 'Success' });
            }
          } catch (e) {
            results.push({ target: `Group ${groupId}`, status: `Error: ${e.message}` });
          }
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
