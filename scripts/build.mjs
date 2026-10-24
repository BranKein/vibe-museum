// Builds dist/: collects the exhibits (skip with --no-collect to reuse data/), copies the site, writes config.js
// from the environment, adds a title, description, canonical link, Open Graph tags and the Cloudflare Web Analytics
// beacon to every page, writes the exhibit list into each hall as plain HTML (the hall's script draws over it) so
// search engines see it without running scripts, and makes a small share page per exhibit (e/<id>.html) so a
// shared link previews that exhibit. Also writes robots.txt and sitemap.xml.
//
// Environment (all optional):
//   SITE_URL                 https://vive-museum.yeonhyuk.me
//   CF_BEACON_TOKEN          Cloudflare Web Analytics token; no beacon without it
//   GOOGLE_SITE_VERIFICATION Google Search Console meta tag value; no tag without it
//   NAVER_SITE_VERIFICATION  Naver Search Advisor meta tag value; no tag without it
//   IDEAS_API_URL       visitor idea API; without it the form only shows a note, as before
//   TURNSTILE_SITE_KEY  Cloudflare Turnstile site key for the idea form
//   ADSENSE_CLIENT       AdSense publisher id (ca-pub-… or pub-…); no ad script or slots without it
//   ADSENSE_SLOT_INFEED  ad unit id for the in-feed card on the pinboard
//   ADSENSE_SLOT_DISPLAY ad unit id for the box under the catalogue and the night hall
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyticsTag, esc, ogTags } from './lib.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(HERE, 'dist');
const PAGES = ['index.html', 'pinboard.html', 'hall.html', 'catalogue.html', 'night.html'];
const COPY = ['shared.js', 'img', 'data'];

// Each page's title and description, Korean first and then English so the page matches searches in either.
// canonical is the page search engines should show; the entrance only sends visitors on, so it points at the pinboard.
export const PAGE_META = {
  'index.html': {
    title: '바이브 뮤지엄 · Vibe Museum',
    description: '바이브 코딩으로 만든 것들을 모아 둔 작은 박물관. A small museum of things made by vibe coding.',
    canonical: 'pinboard.html',
  },
  'pinboard.html': {
    title: '바이브 뮤지엄 · Vibe Museum',
    description: '바이브 코딩으로 만든 것들을 모아 둔 작은 박물관. 전시 중인 작품과 준비 중인 작품을 핀보드에서 둘러봅니다. ' +
      'A small museum of things made by vibe coding: works on show and works in progress, pinned to one board.',
    canonical: 'pinboard.html',
  },
  'hall.html': {
    title: '3D 전시관 · Gallery Walk — 바이브 뮤지엄 Vibe Museum',
    description: '바이브 코딩으로 만든 작품들을 3D 복도를 걸으며 봅니다. Walk a 3D corridor of things made by vibe coding.',
    canonical: 'hall.html',
  },
  'catalogue.html': {
    title: '전시 도록 · Catalogue — 바이브 뮤지엄 Vibe Museum',
    description: '바이브 코딩으로 만든 작품들을 한 장씩 넘기는 도록. A catalogue of things made by vibe coding, one plate at a time.',
    canonical: 'catalogue.html',
  },
  'night.html': {
    title: '야간 개장 · After Hours — 바이브 뮤지엄 Vibe Museum',
    description: '큰 글씨와 큰 그림으로 보는 바이브 코딩 작품들. 손전등으로 둘러볼 수도 있습니다. ' +
      'Things made by vibe coding in large type and large pictures, with a torch to look around.',
    canonical: 'night.html',
  },
};

// The element each hall draws its exhibits into. The build fills it with a plain list first.
export const LIST_SLOT = { 'pinboard.html': 'board', 'hall.html': 'strip', 'catalogue.html': 'book', 'night.html': 'hall' };

// Keeps the plain list readable for the moment before a hall draws over it (the 3D hall waits for its fonts).
const LIST_STYLE = '<style>.vm-static{list-style:none;margin:0;padding:0;display:grid;gap:14px}.vm-static h2{font-size:16px;margin:0}.vm-static p{margin:2px 0 0}</style>';

/** Puts the head tags into a page, just before </head>. */
export function inject(html, tags) {
  return html.replace('</head>', tags + '\n</head>');
}

/** Sets the page's <title>. */
export function setTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
}

/** Puts inner HTML into the (empty) element with the given id. */
export function fill(html, id, inner) {
  return html.replace(new RegExp('(<[a-z]+[^>]*\\sid="' + id + '"[^>]*>)(</)'), (m, open, close) => open + inner + close);
}

/** The exhibits in the order the halls show them: live ones by last deployment, then upcoming ones by the date noted. */
export function ordered(exhibits) {
  const live = exhibits.filter((e) => e.status === 'live').sort((a, b) => (b.deployed || '').localeCompare(a.deployed || ''));
  const up = exhibits.filter((e) => e.status !== 'live').sort((a, b) => (b.noted || '').localeCompare(a.noted || ''));
  return live.concat(up);
}

/** The exhibit list as plain HTML in both languages, for visitors and crawlers without scripts. */
export function staticList(exhibits) {
  return '<ul class="vm-static">' + ordered(exhibits).map((e) => {
    const name = esc(e.title.ko) + ' · ' + esc(e.title.en);
    const live = e.status === 'live';
    return '<li><h2>' + (live ? '<a href="' + esc(e.url) + '">' + name + '</a>' : name) + '</h2>' +
      '<p>' + (live ? '전시 중 · On show' : '준비 중 · Coming soon') + '</p>' +
      '<p>' + esc(e.blurb.ko) + '</p><p lang="en">' + esc(e.blurb.en) + '</p></li>';
  }).join('') + '</ul>';
}

/** schema.org WebSite and ItemList of the exhibits as JSON-LD. */
export function jsonLd(exhibits, siteUrl) {
  const data = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: '바이브 뮤지엄 · Vibe Museum', url: siteUrl + '/', inLanguage: ['ko', 'en'], description: PAGE_META['pinboard.html'].description },
    {
      '@context': 'https://schema.org', '@type': 'ItemList', name: '바이브 뮤지엄 전시품 · Vibe Museum exhibits',
      itemListElement: ordered(exhibits).map((e, i) => {
        const item = { '@type': 'ListItem', position: i + 1, name: e.title.ko + ' · ' + e.title.en, description: e.blurb.ko + ' ' + e.blurb.en };
        if (e.status === 'live') item.url = e.url;
        return item;
      }),
    },
  ];
  return '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>';
}

/** Search engine ownership tags, each only when its value is set. */
export function verificationTags(env) {
  const tags = [];
  if (env.GOOGLE_SITE_VERIFICATION) tags.push('<meta name="google-site-verification" content="' + esc(env.GOOGLE_SITE_VERIFICATION) + '">');
  if (env.NAVER_SITE_VERIFICATION) tags.push('<meta name="naver-site-verification" content="' + esc(env.NAVER_SITE_VERIFICATION) + '">');
  return tags.join('\n');
}

// The pages that carry an ad slot. The 3D hall, the entrance and the share pages never do.
export const AD_PAGES = ['pinboard.html', 'catalogue.html', 'night.html'];

/** The AdSense publisher id as ca-pub-<digits>, or '' when it is unset or not an id. */
export function adsenseClient(env) {
  const m = /^(?:ca-)?pub-(\d{10,20})$/.exec((env.ADSENSE_CLIENT || '').trim());
  return m ? 'ca-pub-' + m[1] : '';
}

/** An ad unit id (digits only), or '' when it is unset or not an id. */
export function adSlot(value) {
  const v = (value || '').trim();
  return /^\d{5,20}$/.test(v) ? v : '';
}

/** The AdSense loader for a page with an ad slot; '' without a publisher id. */
export function adsenseTag(env) {
  const client = adsenseClient(env);
  return client ? '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + client + '" crossorigin="anonymous"></script>' : '';
}

/** The head tags for one page. */
export function pageHead(page, siteUrl, extra) {
  const meta = PAGE_META[page];
  const url = siteUrl + '/' + meta.canonical;
  return '<link rel="canonical" href="' + esc(url) + '">\n' +
    ogTags({ title: meta.title, description: meta.description, url, image: siteUrl + '/img/og.png' }) + (extra ? '\n' + extra : '');
}

export function robotsTxt(siteUrl) {
  return 'User-agent: *\nAllow: /\n\nSitemap: ' + siteUrl + '/sitemap.xml\n';
}

/** The four halls; the entrance and the share pages stay out. */
export function sitemapXml(siteUrl, date) {
  const urls = Object.keys(LIST_SLOT).map((page) =>
    '  <url><loc>' + esc(siteUrl + '/' + page) + '</loc><lastmod>' + date + '</lastmod></url>');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n';
}

/** window.VM_CONFIG for the pages. */
export function configScript(env) {
  const config = { ideasApi: (env.IDEAS_API_URL || '').replace(/\/+$/, ''), turnstileSiteKey: env.TURNSTILE_SITE_KEY || '' };
  const client = adsenseClient(env);
  if (client) {
    config.adsenseClient = client;
    config.adsenseSlots = { infeed: adSlot(env.ADSENSE_SLOT_INFEED), display: adSlot(env.ADSENSE_SLOT_DISPLAY) };
  }
  return '/* Made by scripts/build.mjs from the environment. */\nwindow.VM_CONFIG = ' + JSON.stringify(config) + ';\n';
}

/** A page that previews one exhibit when shared, then sends the visitor on to the museum. */
export function sharePage(exhibit, siteUrl, beacon) {
  const title = exhibit.title.en + ' · ' + exhibit.title.ko + ' — Vibe Museum';
  const description = exhibit.blurb.en + ' ' + exhibit.blurb.ko;
  const image = exhibit.thumb ? siteUrl + '/' + exhibit.thumb : siteUrl + '/img/og.png';
  return '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' + ogTags({ title, description, url: siteUrl + '/e/' + exhibit.id + '.html', image }) + '\n' +
    '<meta name="robots" content="noindex">\n<meta http-equiv="refresh" content="0; url=../index.html">\n' + beacon + '\n</head>\n<body>\n' +
    '<p><a href="../index.html">Vibe Museum</a> · <a href="' + esc(exhibit.url) + '">' + esc(exhibit.title.en) + '</a></p>\n</body>\n</html>\n';
}

/** One page as built: its title, the plain exhibit list and the head tags (plus the ad loader where a page has a slot). */
export function renderPage(page, source, exhibits, env, siteUrl) {
  let html = setTitle(source, PAGE_META[page].title);
  let extra = [verificationTags(env), analyticsTag(env.CF_BEACON_TOKEN), AD_PAGES.includes(page) ? adsenseTag(env) : ''].filter(Boolean).join('\n');
  if (LIST_SLOT[page]) {
    html = fill(html, LIST_SLOT[page], staticList(exhibits));
    extra = LIST_STYLE + (page === 'pinboard.html' ? '\n' + jsonLd(exhibits, siteUrl) : '') + (extra ? '\n' + extra : '');
  }
  return inject(html, pageHead(page, siteUrl, extra));
}

export async function build({ collectFirst = true, env = process.env } = {}) {
  if (collectFirst) {
    const { collect } = await import('./collect.mjs');
    await collect();
  }
  if (!existsSync(join(HERE, 'data', 'exhibits.js'))) throw new Error('data/exhibits.js is missing: run npm run collect');
  const siteUrl = (env.SITE_URL || 'https://vive-museum.yeonhyuk.me').replace(/\/+$/, '');
  const beacon = analyticsTag(env.CF_BEACON_TOKEN);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, 'e'), { recursive: true });
  for (const item of COPY) await cp(join(HERE, item), join(DIST, item), { recursive: true });
  await writeFile(join(DIST, 'config.js'), configScript(env));

  globalThis.window = {};
  const code = await readFile(join(HERE, 'data', 'exhibits.js'), 'utf8');
  new Function('window', code)(globalThis.window);
  const exhibits = globalThis.window.VM_EXHIBITS || [];
  delete globalThis.window;

  for (const page of PAGES) {
    await writeFile(join(DIST, page), renderPage(page, await readFile(join(HERE, page), 'utf8'), exhibits, env, siteUrl));
  }
  await writeFile(join(DIST, 'robots.txt'), robotsTxt(siteUrl));
  await writeFile(join(DIST, 'sitemap.xml'), sitemapXml(siteUrl, new Date().toISOString().slice(0, 10)));
  for (const e of exhibits.filter((x) => x.status === 'live')) {
    await writeFile(join(DIST, 'e', e.id + '.html'), sharePage(e, siteUrl, beacon));
  }
  return { pages: PAGES.length, shares: (await readdir(join(DIST, 'e'))).length };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  if (!process.env.ROOT_DIR && existsSync(join(HERE, '..', '..', '.gitmodules')) && process.env.CI !== 'true') {
    process.env.ROOT_DIR = join(HERE, '..', '..');
  }
  const result = await build({ collectFirst: !process.argv.includes('--no-collect') });
  console.log('dist/ ready:', result.pages, 'pages,', result.shares, 'share pages');
}
