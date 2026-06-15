import { NextResponse } from 'next/server';

export const maxDuration = 60; // 60s timeout limit to prevent Vercel 504 errors

export async function POST(request) {
  try {
    const { imageBase64 } = await request.json();
    const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
    const OR_KEY = process.env.OPENROUTER_API_KEY?.trim();
    const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    const mimeType = imageBase64.match(/^data:(image\/[a-z]+);base64,/)?.[1] || "image/jpeg";
    const promptText = "Extract any text from this image (OCR). Then, write an engaging World Cup football/soccer update for the Facebook page 'PlayMechi'. Format the caption professionally with a catchy hook, the main update/score/news from the image, and relevant World Cup hashtags (e.g., #WorldCup, #PlayMechi, #Football). Keep it exciting! CRITICAL: DO NOT use any markdown formatting like **asterisks** or bolding. Use plain text only. Only return the caption text without any extra conversation.";

    let caption = null;
    let lastError = null;

    // 1. Try OpenAI (Primary - Best for bulk rate limits)
    if (OPENAI_KEY) {
      try {
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
        if (oaiRes.ok && oaiData.choices?.[0]?.message?.content) {
          caption = oaiData.choices[0].message.content.trim();
        } else {
          lastError = oaiData.error?.message || 'OpenAI failed';
          console.warn("OpenAI API Failed:", oaiData);
        }
      } catch (err) {
        lastError = err.message;
        console.warn("OpenAI Fetch Failed:", err.message);
      }
    }

    // 2. Fallback to OpenRouter
    if (!caption && OR_KEY && OR_KEY !== 'your_openrouter_api_key_here') {
      try {
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OR_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Facebook AutoPoster',
          },
          body: JSON.stringify({
            model: 'google/gemini-flash-1.5',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  { type: 'image_url', image_url: { url: imageBase64 } }
                ]
              }
            ]
          })
        });

        const orData = await orRes.json();
        if (orRes.ok && orData.choices?.[0]?.message?.content) {
          caption = orData.choices[0].message.content.trim();
        } else {
          lastError = 'OpenRouter failed';
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    // 3. Fallback to Google AI Studio
    if (!caption && GEMINI_KEY && GEMINI_KEY !== 'your_gemini_api_key_here') {
      try {
        const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
            generationConfig: { temperature: 0.7 }
          })
        });
        const gemData = await gemRes.json();
        
        if (gemRes.ok && gemData.candidates?.[0]?.content?.parts?.[0]?.text) {
          caption = gemData.candidates[0].content.parts[0].text.trim();
        } else {
          lastError = gemData.error?.message || 'Google Gemini API failed';
        }
      } catch (err) {
         lastError = err.message;
      }
    }

    if (!caption) {
       throw new Error(lastError || 'All AI providers failed. Please check your API keys.');
    }

    return NextResponse.json({ caption });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
