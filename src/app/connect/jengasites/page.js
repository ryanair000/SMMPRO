import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

export default async function ConnectJengaSitesPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(
    cookieStore.get(AUTH_COOKIE_NAME)?.value || '',
  );

  if (!session) {
    redirect('/login?next=/connect/jengasites');
  }

  const returnTo = encodeURIComponent(
    'https://socio.jengasites.com/connections',
  );
  redirect(
    `/api/integrations/meta/connect?accountId=jengasites&returnTo=${returnTo}`,
  );
}
