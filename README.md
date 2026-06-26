# SMM Pro Facebook/Instagram Poster

Next.js app for generating captions and publishing posts to Facebook Pages and Instagram accounts. It includes managed account switching for ChezaHub and JengaSites.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Refresh Meta Tokens

Meta short-lived user tokens must be exchanged with the matching Meta App ID and App Secret.

Put these values in `.env.local`:

```env
CHEZAHUB_FB_PAGE_ID=your_chezahub_facebook_page_id
CHEZAHUB_FB_PAGE_ACCESS_TOKEN=your_chezahub_page_access_token
CHEZAHUB_FB_USER_ACCESS_TOKEN=your_chezahub_user_access_token
CHEZAHUB_IG_USER_ID=your_chezahub_instagram_business_or_creator_account_id

JENGASITES_FB_PAGE_ID=your_jengasites_facebook_page_id
JENGASITES_FB_PAGE_ACCESS_TOKEN=your_jengasites_page_access_token
JENGASITES_FB_USER_ACCESS_TOKEN=your_jengasites_user_access_token
JENGASITES_IG_USER_ID=your_jengasites_instagram_business_or_creator_account_id

META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
```

The legacy `NEXT_PUBLIC_FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `FB_USER_ACCESS_TOKEN`, and `IG_USER_ID` names still work as ChezaHub fallbacks.

Then run:

```bash
npm run tokens:refresh
```

The script updates `.env.local` with:

- `FB_USER_ACCESS_TOKEN`: long-lived user token
- `FB_PAGE_ACCESS_TOKEN`: Page token fetched from the long-lived user token
- `IG_USER_ID`: connected Instagram professional account ID, when Meta returns one

You can also pass values without storing the app credentials in `.env.local`:

```bash
node get-long-lived-tokens.js --app-id YOUR_META_APP_ID --app-secret YOUR_META_APP_SECRET --user-token YOUR_SHORT_LIVED_TOKEN
```

Useful options:

```bash
node get-long-lived-tokens.js --help
node get-long-lived-tokens.js --no-write
node get-long-lived-tokens.js --skip-instagram
```

## Instagram Publishing Note

Instagram Content Publishing requires a connected Instagram Business or Creator account and a publicly reachable image URL. Direct multipart file uploads work for Facebook Photos, but not for Instagram publishing.

## Deploy

After refreshing local tokens, add the updated env vars to your hosting provider. For Vercel:

```bash
npx vercel env add FB_USER_ACCESS_TOKEN production
npx vercel env add FB_PAGE_ACCESS_TOKEN production
npx vercel env add IG_USER_ID production
npx vercel deploy --prod
```

Never commit `.env.local`; it is intentionally ignored.
