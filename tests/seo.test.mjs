import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIST_SLOT, PAGE_META, fill, jsonLd, pageHead, robotsTxt, setTitle, sharePage, sitemapXml, staticList, verificationTags } from '../scripts/build.mjs';

const SITE = 'https://vive-museum.yeonhyuk.me';
const EXHIBITS = [
  { id: 'p', status: 'upcoming', noted: '2026-10-12', title: { ko: '문제', en: 'Problems' }, blurb: { ko: '준비 <중>', en: 'Soon' } },
  { id: 'w', status: 'live', url: 'https://w.yeonhyuk.me', deployed: '2026-10-16', title: { ko: '창고', en: 'Warehouse' }, blurb: { ko: '설명', en: 'About' } },
];

test('every page has its own title, a bilingual description and a canonical link', () => {
  const canonical = { 'index.html': 'pinboard.html', 'pinboard.html': 'pinboard.html', 'hall.html': 'hall.html', 'catalogue.html': 'catalogue.html', 'night.html': 'night.html' };
  for (const [page, target] of Object.entries(canonical)) {
    const head = pageHead(page, SITE, '');
    assert.match(head, new RegExp('<link rel="canonical" href="' + SITE + '/' + target + '">'), page);
    assert.match(head, new RegExp('og:url" content="' + SITE + '/' + target + '"'), page);
    assert.match(PAGE_META[page].description, /[가-힣]/, page);
    assert.match(PAGE_META[page].description, /[A-Za-z]{4}/, page);
    assert.match(head, /<meta name="description" content="[^"]+">/, page);
  }
  assert.equal(new Set(Object.values(PAGE_META).map((m) => m.description)).size, 5);
  assert.equal(setTitle('<title>Old</title>', 'A · B'), '<title>A · B</title>');
});

test('share pages are kept out of search results but still preview', () => {
  const html = sharePage({ ...EXHIBITS[1], thumb: 'img/exhibits/w.jpg' }, SITE, '');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /og:title/);
});

test('robots.txt allows everything and points at the sitemap', () => {
  assert.equal(robotsTxt(SITE), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
});

test('sitemap.xml lists the four halls with the build date', () => {
  const xml = sitemapXml(SITE, '2026-10-20');
  for (const page of ['pinboard.html', 'hall.html', 'catalogue.html', 'night.html']) {
    assert.ok(xml.includes('<url><loc>' + SITE + '/' + page + '</loc><lastmod>2026-10-20</lastmod></url>'), page);
  }
  assert.ok(!xml.includes('index.html') && !xml.includes('/e/'));
});

test('the plain exhibit list has both titles, escaped blurbs and links for live works, in hall order', () => {
  const html = staticList(EXHIBITS);
  assert.ok(html.indexOf('창고 · Warehouse') < html.indexOf('문제 · Problems'));
  assert.match(html, /<a href="https:\/\/w.yeonhyuk.me">창고 · Warehouse<\/a>/);
  assert.match(html, /준비 &lt;중&gt;/);
  assert.match(html, /<p lang="en">About<\/p>/);
  assert.ok(!/hidden|display:\s*none/.test(html));
});

test('each hall page has the element its list goes into', () => {
  for (const [page, id] of Object.entries(LIST_SLOT)) {
    const html = readFileSync(new URL('../' + page, import.meta.url), 'utf8');
    assert.ok(fill(html, id, '<ul class="vm-static"></ul>').includes('id="' + id + '"') && fill(html, id, 'X') !== html, page);
  }
  assert.equal(fill('<main class="a" id="board"></main>', 'board', '<p>x</p>'), '<main class="a" id="board"><p>x</p></main>');
});

test('JSON-LD names the site and the exhibits and cannot close its script tag', () => {
  const tag = jsonLd(EXHIBITS, SITE);
  const body = tag.replace('<script type="application/ld+json">', '').replace('</script>', '');
  assert.ok(!body.includes('<'));
  const [site, list] = JSON.parse(body);
  assert.equal(site['@type'], 'WebSite');
  assert.equal(list.itemListElement[0].url, 'https://w.yeonhyuk.me');
  assert.equal(list.itemListElement[1].description, '준비 <중> Soon');
});

test('verification tags appear only when their values are set', () => {
  assert.equal(verificationTags({}), '');
  assert.equal(verificationTags({ GOOGLE_SITE_VERIFICATION: 'g1' }), '<meta name="google-site-verification" content="g1">');
  assert.equal(verificationTags({ GOOGLE_SITE_VERIFICATION: 'g1', NAVER_SITE_VERIFICATION: 'n1' }),
    '<meta name="google-site-verification" content="g1">\n<meta name="naver-site-verification" content="n1">');
});
