import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AD_PAGES, adSlot, adsenseClient, adsenseTag, configScript, renderPage, sharePage } from '../scripts/build.mjs';

const PAGES = ['index.html', 'pinboard.html', 'hall.html', 'catalogue.html', 'night.html'];
const SITE = 'https://vibe-museum.yeonhyuk.me';
const EXHIBITS = [{ id: 'w', status: 'live', url: 'https://w.yeonhyuk.me', deployed: '2026-10-16', title: { ko: '창고', en: 'Warehouse' }, blurb: { ko: '설명', en: 'About' } }];
const ENV = { ADSENSE_CLIENT: 'pub-0000000000000000', ADSENSE_SLOT_INFEED: '1234567890', ADSENSE_SLOT_DISPLAY: '2345678901' };
const LOADER = 'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-0000000000000000';

test('the publisher id is normalised to ca-pub-… and anything else means no ads', () => {
  assert.equal(adsenseClient({ ADSENSE_CLIENT: 'ca-pub-0000000000000000' }), 'ca-pub-0000000000000000');
  assert.equal(adsenseClient({ ADSENSE_CLIENT: ' pub-0000000000000000 ' }), 'ca-pub-0000000000000000');
  assert.equal(adsenseClient({}), '');
  assert.equal(adsenseClient({ ADSENSE_CLIENT: 'ca-pub-12"><script>' }), '');
  assert.equal(adSlot(' 1234567890 '), '1234567890');
  assert.equal(adSlot('abc'), '');
  assert.equal(adSlot(undefined), '');
});

test('the loader tag only appears with a publisher id', () => {
  assert.equal(adsenseTag({}), '');
  assert.equal(adsenseTag(ENV), '<script async src="https://' + LOADER + '" crossorigin="anonymous"></script>');
  assert.deepEqual(AD_PAGES, ['pinboard.html', 'catalogue.html', 'night.html']);
});

test('config.js carries the publisher id and slots only when set', () => {
  assert.equal(configScript({}), '/* Made by scripts/build.mjs from the environment. */\nwindow.VM_CONFIG = {"ideasApi":"","turnstileSiteKey":""};\n');
  assert.ok(!configScript({ ADSENSE_SLOT_INFEED: '1234567890' }).includes('adsense'));
  assert.match(configScript(ENV), /"adsenseClient":"ca-pub-0000000000000000","adsenseSlots":\{"infeed":"1234567890","display":"2345678901"\}/);
  assert.match(configScript({ ADSENSE_CLIENT: ENV.ADSENSE_CLIENT }), /"adsenseSlots":\{"infeed":"","display":""\}/);
});

test('pages: no ad script without the variables; with them only on pinboard, catalogue and night, never the 3D hall, entrance or share pages', () => {
  for (const page of PAGES) {
    const source = readFileSync(new URL('../' + page, import.meta.url), 'utf8');
    assert.ok(!renderPage(page, source, EXHIBITS, {}, SITE).includes('adsbygoogle'), page);
    assert.equal(renderPage(page, source, EXHIBITS, ENV, SITE).includes(LOADER), AD_PAGES.includes(page), page);
    assert.equal(renderPage(page, source, EXHIBITS, ENV, SITE).split('adsbygoogle.js').length - 1, AD_PAGES.includes(page) ? 1 : 0, page);
  }
  assert.ok(!sharePage(EXHIBITS[0], SITE, '').includes('adsbygoogle'));
});

test('the page sources themselves carry no ad code; shared.js only draws slots from config', () => {
  for (const page of PAGES) assert.ok(!readFileSync(new URL('../' + page, import.meta.url), 'utf8').includes('adsbygoogle'), page);
  const shared = readFileSync(new URL('../shared.js', import.meta.url), 'utf8');
  assert.match(shared, /if \(!CONFIG\.adsenseClient\) return;/);
  assert.match(shared, /try \{ \(window\.adsbygoogle = window\.adsbygoogle \|\| \[\]\)\.push\(\{\}\); \} catch/);
});
