import { NextResponse } from 'next/server';
import { POST as publishWithExistingRoute } from '../post/route';
import { getResolvedMetaCredentials } from '@/lib/meta';
import { getSocialAccount } from '@/lib/socialAccounts';

function setCredentialEnv(accountId, credentials) {
  const account = getSocialAccount(accountId);
  const assignments = [
    [account.env?.pageId, credentials.pageId],
    [account.env?.pageToken, credentials.pageToken],
    [account.env?.userToken, credentials.metaUserToken || credentials.userToken],
    [account.env?.igUserId, credentials.igUserId],
  ];

  for (const [key, value] of assignments) {
    if (key && value) process.env[key] = String(value);
  }

  if (accountId === 'chezahub' && account.legacyEnv) {
    const legacyAssignments = [
      [account.legacyEnv.pageId, credentials.pageId],
      [account.legacyEnv.pageToken, credentials.pageToken],
      [
        account.legacyEnv.userToken,
        credentials.metaUserToken || credentials.userToken,
      ],
      [account.legacyEnv.igUserId, credentials.igUserId],
    ];
    for (const [key, value] of legacyAssignments) {
      if (key && value) process.env[key] = String(value);
    }
  }
}

export async function POST(request) {
  try {
    const formData = await request.clone().formData();
    const accountId = formData.get('accountId')?.toString() || 'chezahub';
    const resolved = await getResolvedMetaCredentials(accountId);
    setCredentialEnv(accountId, resolved.credentials);
    console.info(
      `[meta-credentials] ${accountId}: publishing with ${resolved.source} credentials.`,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not load Facebook publishing credentials.';
    console.error(`[meta-credentials] ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    return await publishWithExistingRoute(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Publishing failed.' },
      { status: 500 },
    );
  }
}
