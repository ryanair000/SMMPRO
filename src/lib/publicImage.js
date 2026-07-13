import crypto from 'node:crypto';

const DEFAULT_BUCKET = 'smm-media';

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceRoleKey) {
    throw new Error('Public image storage is not configured.');
  }

  return { url, serviceRoleKey };
}

function extensionForType(contentType) {
  const extension = contentType.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension === 'jpeg' ? 'jpg' : extension || 'jpg';
}

export async function uploadPublicImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('An image file is required.');
  }

  const { url, serviceRoleKey } = getSupabaseConfig();
  const bucket = (process.env.SMM_MEDIA_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
  const contentType = file.type?.startsWith('image/') ? file.type : 'image/jpeg';
  const path = `instagram/${crypto.randomUUID()}.${extensionForType(contentType)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');

  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType,
      'x-upsert': 'false'
    },
    body: bytes
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || 'Image upload failed.');
  }

  return `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}
