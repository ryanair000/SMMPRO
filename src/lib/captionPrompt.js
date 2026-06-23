export const CHEZAHUB_CAPTION_PROMPT = `
Extract any readable text from the image and use it as context.

Write a social media caption for Chezahub, a gaming brand at chezahub.co.ke.

Caption rules:
- Focus on what is actually visible in the image.
- If the image is about a specific game, match that game or moment.
- If the image is unclear, keep the caption general and energetic without inventing details.
- Use a short hook, then 1-2 concise lines of context or excitement.
- Include a soft call to action mentioning chezahub.co.ke.
- Use relevant hashtags such as #Chezahub, #Gaming, #Gamers, #KenyaGaming, and game-specific tags when obvious.
- Do not mention PlayMechi, World Cup, football, or soccer unless the image clearly shows that topic.
- Do not use markdown formatting, bold text, bullet points, or quotation marks.
- Return only the caption text.
`.trim();
