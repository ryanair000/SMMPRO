export const SOCIAL_ACCOUNTS = [
  {
    id: 'chezahub',
    name: 'ChezaHub',
    handle: '@chezahub',
    description: 'Gaming offers, consoles, accessories, and player-focused content.',
    website: 'chezahub.co.ke',
    accent: '#9f1239',
    shortName: 'CH',
    platforms: {
      facebook: true,
      instagram: true,
      tiktok: true
    },
    env: {
      pageId: 'CHEZAHUB_FB_PAGE_ID',
      pageToken: 'CHEZAHUB_FB_PAGE_ACCESS_TOKEN',
      userToken: 'CHEZAHUB_FB_USER_ACCESS_TOKEN',
      igUserId: 'CHEZAHUB_IG_USER_ID'
    },
    legacyEnv: {
      pageId: 'NEXT_PUBLIC_FB_PAGE_ID',
      pageToken: 'FB_PAGE_ACCESS_TOKEN',
      userToken: 'FB_USER_ACCESS_TOKEN',
      igUserId: 'IG_USER_ID'
    }
  },
  {
    id: 'jengasites',
    name: 'JengaSites',
    handle: '@jengasites',
    description: 'Kenyan websites, booking systems, e-commerce, branding, and social content.',
    website: 'jengasites.com',
    accent: '#0f766e',
    shortName: 'JS',
    platforms: {
      facebook: false,
      instagram: true,
      tiktok: false
    },
    env: {
      pageId: 'JENGASITES_FB_PAGE_ID',
      pageToken: 'JENGASITES_FB_PAGE_ACCESS_TOKEN',
      userToken: 'JENGASITES_FB_USER_ACCESS_TOKEN',
      igUserId: 'JENGASITES_IG_USER_ID'
    }
  }
];

export function getSocialAccount(accountId) {
  return SOCIAL_ACCOUNTS.find(account => account.id === accountId) || SOCIAL_ACCOUNTS[0];
}

export function getAccountCredentials(accountId) {
  const account = getSocialAccount(accountId);

  const readValue = key => process.env[key]?.trim();
  const credentials = {
    pageId: readValue(account.env.pageId),
    pageToken: readValue(account.env.pageToken),
    metaUserToken: readValue(account.env.userToken),
    igUserId: readValue(account.env.igUserId)
  };

  if (account.legacyEnv) {
    credentials.pageId ||= readValue(account.legacyEnv.pageId);
    credentials.pageToken ||= readValue(account.legacyEnv.pageToken);
    credentials.metaUserToken ||= readValue(account.legacyEnv.userToken);
    credentials.igUserId ||= readValue(account.legacyEnv.igUserId);
  }

  // Instagram API with Facebook Login publishes with the Page access token.
  // Keep `userToken` as a compatibility alias for the existing publisher routes.
  credentials.instagramAccessToken = credentials.pageToken || credentials.metaUserToken;
  credentials.userToken = credentials.instagramAccessToken;

  return { account, credentials };
}
