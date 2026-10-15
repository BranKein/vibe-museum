// Builds dist/: collects the exhibits (skip with --no-collect to reuse data/), copies the site, writes config.js
// from the environment, adds Open Graph tags and the Cloudflare Web Analytics beacon to every page, and makes a
// small share page per exhibit (e/<id>.html) so a shared link previews that exhibit.
//
// Environment (all optional):
//   SITE_URL            https://vive-museum.yeonhyuk.me
//   CF_BEACON_TOKEN     Cloudflare Web Analytics token; no beacon without it
//   IDEAS_API_URL       visitor idea API; without it the form only shows a note, as before
//   TURNSTILE_SITE_KEY  Cloudflare Turnstile site key for the idea form
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyticsTag, esc, ogTags } from './lib.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(HERE, 'dist');
const PAGES = ['index.html', 'pinboard.html', 'hall.html', 'catalogue.html', 'night.html'];
const COPY = ['shared.js', 'img', 'data'];

export const SITE = {
  title: 'Vive Museum · 바이브 뮤지엄',
  description: 'A small museum of things made by vibe coding · 바이브 코딩으로 만든 것들을 모아 둔 작은 박물관',
};

/** Puts the head tags into a page, just before </head>. */
export function inject(html, tags) {
  return html.replace('</head>', tags + '\n</head>');
}

/** window.VM_CONFIG for the pages. */
export function configScript(env) {
  const config = { ideasApi: (env.IDEAS_API_URL || '').replace(/\/+$/, ''), turnstileSiteKey: env.TURNSTILE_SITE_KEY || '' };
  return '/* Made by scripts/build.mjs from the environment. */\nwindow.VM_CONFIG = ' + JSON.stringify(config) + ';\n';
}

/** A page that previews one exhibit when shared, then sends the visitor on to the museum. */
export function sharePage(exhibit, siteUrl, beacon) {
  const title = exhibit.title.en + ' · ' + exhibit.title.ko + ' — Vive Museum';
  const description = exhibit.blurb.en + ' ' + exhibit.blurb.ko;
  const image = exhibit.thumb ? siteUrl + '/' + exhibit.thumb : siteUrl + '/img/og.png';
  return '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' + ogTags({ title, description, url: siteUrl + '/e/' + exhibit.id + '.html', image }) + '\n' +
    '<meta http-equiv="refresh" content="0; url=../index.html">\n' + beacon + '\n</head>\n<body>\n' +
    '<p><a href="../index.html">Vive Museum</a> · <a href="' + esc(exhibit.url) + '">' + esc(exhibit.title.en) + '</a></p>\n</body>\n</html>\n';
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

  const head = ogTags({ title: SITE.title, description: SITE.description, url: siteUrl + '/', image: siteUrl + '/img/og.png' }) + '\n' + beacon;
  for (const page of PAGES) {
    const html = await readFile(join(HERE, page), 'utf8');
    await writeFile(join(DIST, page), inject(html, head));
  }

  globalThis.window = {};
  const code = await readFile(join(HERE, 'data', 'exhibits.js'), 'utf8');
  new Function('window', code)(globalThis.window);
  const exhibits = globalThis.window.VM_EXHIBITS || [];
  delete globalThis.window;
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
