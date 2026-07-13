# SMM Pro Facebook/Instagram Poster

Next.js app for generating captions and publishing posts to Facebook Pages and Instagram accounts. It includes managed account switching for ChezaHub and JengaSites.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Run the durable publishing migration before the first deployment:

```bash
npm run db:migrate
```

## Refresh Meta Tokens

Meta short-lived user tokens must be exchanged with the matching Meta App ID and App Secret.

Put these values in `.env.local`:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use_a_long_random_password
AUTH_SECRET=use_at_least_32_random_characters

OPENAI_API_KEY=your_openai_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WEBHOOK_SECRET=your_telegram_webhook_secret_token
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321

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

`AUTH_SECRET` signs the admin session cookie. Use a long random value and rotate it if the old hard-coded login was ever deployed publicly.

For Telegram, set your webhook with the same secret token stored in `TELEGRAM_WEBHOOK_SECRET`, and list only approved chat IDs in `TELEGRAM_ALLOWED_CHAT_IDS`.

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

## Socio Publishing Contract

`POST /api/post` accepts ordered, repeated `imageUrls` form fields and an optional
`idempotencyKey`. Two to ten URLs are published as a native Facebook multi-photo
post or Instagram carousel. Completed idempotency keys replay their stored result
instead of creating a duplicate provider post.

## Deploy

After refreshing local tokens, add the updated env vars to your hosting provider. For Vercel:

```bash
npx vercel env add FB_USER_ACCESS_TOKEN production
npx vercel env add FB_PAGE_ACCESS_TOKEN production
npx vercel env add IG_USER_ID production
npx vercel deploy --prod
```

Never commit `.env.local`; it is intentionally ignored.
