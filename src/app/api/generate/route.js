import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { imageBase64 } = await request.json();
    const OR_KEY = process.env.OPENROUTER_API_KEY;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    const mimeType = imageBase64.match(/^data:(image\/[a-z]+);base64,/)?.[1] || "image/jpeg";
    const promptText = "Extract any text from this image (OCR). Then, write an engaging World Cup football/soccer update for the Facebook page 'PlayMechi'. Format the caption professionally with a catchy hook, the main update/score/news from the image, and relevant World Cup hashtags (e.g., #WorldCup, #PlayMechi, #Football). Keep it exciting! Only return the caption text without any extra conversation.";

    let caption = null;

    // 1. Try OpenRouter First
    if (OR_KEY && OR_KEY !== 'your_openrouter_api_key_here') {
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
            model: 'google/gemini-3.5-flash',
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
          console.warn("OpenRouter API Failed, falling back to Google:", orData);
        }
      } catch (err) {
        console.warn("OpenRouter Fetch Failed, falling back to Google:", err.message);
      }
    }

    // 2. Fallback to Google AI Studio if OpenRouter didn't yield a caption
    if (!caption && GEMINI_KEY && GEMINI_KEY !== 'your_gemini_api_key_here') {
      try {
        const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`, {
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
          throw new Error(gemData.error?.message || 'Google Gemini API failed');
        }
      } catch (err) {
         throw new Error(`Fallback failed: ${err.message}`);
      }
    }

    if (!caption) {
       throw new Error('Both OpenRouter and Google fallback failed. Please check your API keys and network connection.');
    }

    return NextResponse.json({ caption });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
