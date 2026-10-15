import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configScript, inject, sharePage } from '../scripts/build.mjs';

test('inject puts tags before </head>', () => {
  assert.equal(inject('<head><title>x</title></head><body>', '<meta a>'), '<head><title>x</title><meta a>\n</head><body>');
});

test('configScript trims the API address and keeps empty values', () => {
  assert.match(configScript({ IDEAS_API_URL: 'https://api.example/', TURNSTILE_SITE_KEY: 'k' }), /\{"ideasApi":"https:\/\/api.example","turnstileSiteKey":"k"\}/);
  assert.match(configScript({}), /\{"ideasApi":"","turnstileSiteKey":""\}/);
});

test('sharePage previews the exhibit and sends visitors to the museum', () => {
  const html = sharePage({
    id: 'w', url: 'https://w.yeonhyuk.me', thumb: 'img/exhibits/w.jpg',
    title: { ko: '창고', en: 'Warehouse' }, blurb: { ko: '설명', en: 'About' },
  }, 'https://vive-museum.yeonhyuk.me', '');
  assert.match(html, /og:image" content="https:\/\/vive-museum.yeonhyuk.me\/img\/exhibits\/w.jpg"/);
  assert.match(html, /og:url" content="https:\/\/vive-museum.yeonhyuk.me\/e\/w.html"/);
  assert.match(html, /http-equiv="refresh" content="0; url=..\/index.html"/);
});
