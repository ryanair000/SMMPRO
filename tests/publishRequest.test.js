import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectImageUrls,
  getPublishMode,
  validatePublicImageUrls
} from '../src/lib/publishRequest.js';

test('collects ordered Socio imageUrls and removes the imageUrl duplicate', () => {
  const form = new FormData();
  form.set('imageUrl', 'https://cdn.example/one.jpg');
  form.append('imageUrls', 'https://cdn.example/one.jpg');
  form.append('imageUrls', 'https://cdn.example/two.jpg');

  assert.deepEqual(collectImageUrls(form), [
    'https://cdn.example/one.jpg',
    'https://cdn.example/two.jpg'
  ]);
  assert.equal(getPublishMode(form, collectImageUrls(form)), 'carousel');
});

test('keeps the existing carouselItems contract working', () => {
  const form = new FormData();
  form.set('publishMode', 'carousel');
  form.set('carouselItems', JSON.stringify([
    { imageUrl: 'https://cdn.example/one.jpg' },
    { imageUrl: 'https://cdn.example/two.jpg' }
  ]));

  assert.equal(collectImageUrls(form).length, 2);
  assert.equal(getPublishMode(form, collectImageUrls(form)), 'carousel');
});

test('rejects non-HTTPS Instagram carousel media', () => {
  assert.throws(
    () => validatePublicImageUrls(['http://cdn.example/one.jpg'], { requireHttps: true }),
    /HTTPS/
  );
});
