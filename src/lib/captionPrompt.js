export const CHEZAHUB_CAPTION_PROMPT = `
Extract any readable text from the image and use it as context.

Write a social media caption for Chezahub, a gaming brand at chezahub.co.ke.

Caption rules:
- Focus on what is actually visible in the image.
- If the image is about a specific game, match that game or moment.
- If the image is unclear, keep the caption general and energetic without inventing details.
- Use natural line breaks so the caption is easy to scan on Instagram and Facebook.
- Follow this exact structure:
  Line 1: a short hook, maximum 9 words.
  Blank line.
  Lines 3-4: 1-2 concise lines of context or excitement.
  Blank line.
  Next line: a soft call to action mentioning chezahub.co.ke.
  Blank line.
  Final line: 4-7 relevant hashtags such as #Chezahub, #Gaming, #Gamers, #KenyaGaming, plus game-specific tags when obvious.
- Do not mention PlayMechi, World Cup, football, or soccer unless the image clearly shows that topic.
- Do not use markdown formatting, bold text, bullet points, or quotation marks.
- Do not return one long paragraph.
- Return only the caption text.
`.trim();

export const JENGASITES_CAPTION_PROMPT = `
Extract any readable text from the image and use it as context.

Write a social media caption for JengaSites, a Kenyan digital solutions brand by Jenga Digital Solutions.

Brand context:
- JengaSites builds affordable, professional websites and digital business tools for Kenyan and African businesses.
- Services include website design, booking websites powered by Pangia, e-commerce websites, custom web apps, mobile apps, branding, graphic design, social media content, and career solutions like CVs and portfolios.
- The tone should feel practical, clear, professional, locally relevant, and growth-focused.

Caption rules:
- Focus on what is actually visible in the image.
- If the image shows a business type, connect it to a useful digital solution without inventing details.
- Use natural line breaks so the caption is easy to scan on Instagram and Facebook.
- Follow this exact structure:
  Line 1: a short business-focused hook, maximum 9 words.
  Blank line.
  Lines 3-4: 1-2 concise lines explaining the value or solution.
  Blank line.
  Next line: a soft call to action for businesses to build their online presence with JengaSites.
  Blank line.
  Final line: 4-7 relevant hashtags such as #JengaSites, #JengaDigitalSolutions, #WebDesignKenya, #KenyanBusiness, #DigitalSolutions, plus service-specific tags when obvious.
- Do not use markdown formatting, bold text, bullet points, or quotation marks.
- Do not return one long paragraph.
- Return only the caption text.
`.trim();

export function getCaptionPrompt(accountId) {
  if (accountId === 'jengasites') {
    return JENGASITES_CAPTION_PROMPT;
  }

  return CHEZAHUB_CAPTION_PROMPT;
}
