import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { assertContentLength, rateLimit } from '@/lib/rateLimit';
import { uploadPublicImage } from '@/lib/publicImage';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sizeError = assertContentLength(request, MAX_IMAGE_BYTES + 1024 * 1024);
  if (sizeError) return sizeError;

  const rateLimitError = rateLimit(request, {
    scope: 'upload-image',
    limit: 30,
    windowMs: 5 * 60 * 1000
  });
  if (rateLimitError) return rateLimitError;

  try {
    const formData = await request.formData();
    const image = formData.get('image');

    if (!image || typeof image.arrayBuffer !== 'function' || !image.type?.startsWith('image/')) {
      return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Uploaded image must be 10 MB or smaller.' }, { status: 413 });
    }

    const url = await uploadPublicImage(image);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Image upload failed.' }, { status: 500 });
  }
}
