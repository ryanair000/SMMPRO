import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getMetaConnectionStatus } from '@/lib/meta';

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId') || 'jengasites';
  const status = await getMetaConnectionStatus(accountId);
  return NextResponse.json(status);
}
