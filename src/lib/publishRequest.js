export const MIN_CAROUSEL_ITEMS = 2;
export const MAX_CAROUSEL_ITEMS = 10;

function parseLegacyCarouselItems(formData) {
  const raw = formData.get('carouselItems')?.toString();
  if (!raw) return [];

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Carousel items must be valid JSON.');
  }

  return parsed.map(item => item?.imageUrl).filter(value => typeof value === 'string');
}

export function collectImageUrls(formData) {
  const urls = [
    ...formData.getAll('imageUrls').map(value => value.toString()),
    formData.get('imageUrl')?.toString(),
    ...parseLegacyCarouselItems(formData)
  ];

  return [...new Set(urls.map(value => value?.trim()).filter(Boolean))];
}

export function getPublishMode(formData, imageUrls) {
  return formData.get('publishMode') === 'carousel' || imageUrls.length > 1
    ? 'carousel'
    : 'individual';
}

export function validatePublicImageUrls(imageUrls, { requireHttps = false } = {}) {
  for (const imageUrl of imageUrls) {
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new Error('Every image needs a valid public URL.');
    }

    const allowedProtocols = requireHttps ? ['https:'] : ['http:', 'https:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error(requireHttps
        ? 'Instagram carousel images must use public HTTPS URLs.'
        : 'Every image URL must start with http:// or https://.');
    }
  }
}
