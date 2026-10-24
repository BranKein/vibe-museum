// Collects the exhibits into data/exhibits.js (and data/built-issues.json) and downloads the thumbnails into
// img/exhibits/. The list of projects is the root repository's .gitmodules; the "in preparation" ones are its ideas/.
//
// The root repository is read from ROOT_DIR when set (a local checkout), otherwise from GitHub (ROOT_REPO, main).
// Each project's deploy/exhibit.json, deploy/site.json, tags and first commit always come from GitHub main.
// GITHUB_TOKEN is optional; it only raises the API rate limit.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExhibits, builtIssues, latestVersionTag, parseGitmodules, parseIdea, repoKey, seoulDate } from './lib.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_REPO = process.env.ROOT_REPO || 'BranKein/vive-coding-playground';
const API = 'https://api.github.com';

function headers(raw) {
  const h = { 'User-Agent': 'vive-museum-build', Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  return h;
}

/** GET from the GitHub API. Returns null on 404 (missing file, private repository). */
async function gh(path, { raw = false, binary = false, full = false } = {}) {
  const res = await fetch(API + path, { headers: headers(raw) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub ' + res.status + ' for ' + path + ': ' + (await res.text()).slice(0, 200));
  if (full) return res;
  if (binary) return Buffer.from(await res.arrayBuffer());
  return raw ? res.text() : res.json();
}

async function fileOf(owner, repo, path, opts) {
  return gh('/repos/' + owner + '/' + repo + '/contents/' + path, { raw: true, ...opts });
}

async function commitDate(owner, repo, ref) {
  const c = await gh('/repos/' + owner + '/' + repo + '/commits/' + encodeURIComponent(ref));
  return c ? seoulDate(c.commit.committer.date) : null;
}

/** Date of the oldest commit on the default branch: the last page of a one-per-page listing. */
async function firstCommitDate(owner, repo) {
  const res = await gh('/repos/' + owner + '/' + repo + '/commits?per_page=1', { full: true });
  if (!res) return null;
  const last = /<([^>]+)>;\s*rel="last"/.exec(res.headers.get('link') || '');
  const page = last ? await (await fetch(last[1], { headers: headers(false) })).json() : await res.json();
  return page.length ? seoulDate(page[page.length - 1].commit.author.date) : null;
}

async function project({ owner, repo }, thumbDir) {
  const exhibitText = await fileOf(owner, repo, 'deploy/exhibit.json');
  if (!exhibitText) return { owner, repo, exhibit: null };
  const exhibit = JSON.parse(exhibitText);
  const siteText = await fileOf(owner, repo, 'deploy/site.json');
  const tags = (await gh('/repos/' + owner + '/' + repo + '/tags?per_page=100')) || [];
  const names = tags.map((t) => t.name);
  const version = latestVersionTag(names);
  const out = { owner, repo, exhibit, site: siteText ? JSON.parse(siteText) : null, version };
  if (!version) return out;
  out.deployed = await commitDate(owner, repo, version);
  out.started = await firstCommitDate(owner, repo);
  out.firstRelease = names.includes('v1.0.0') ? await commitDate(owner, repo, 'v1.0.0') : null;
  if (exhibit.thumbnail) {
    const image = await fileOf(owner, repo, exhibit.thumbnail.replace(/^\.?\//, ''), { binary: true });
    if (image) {
      const name = (exhibit.id || repoKey(repo)) + extname(exhibit.thumbnail).toLowerCase();
      await writeFile(join(thumbDir, name), image);
      out.thumb = 'img/exhibits/' + name;
    }
  }
  return out;
}

async function rootFiles() {
  const dir = process.env.ROOT_DIR;
  if (dir) {
    const files = (await readdir(join(dir, 'ideas'))).filter((f) => f.endsWith('.md') && f !== 'README.md');
    return {
      gitmodules: await readFile(join(dir, '.gitmodules'), 'utf8'),
      ideas: await Promise.all(files.map(async (f) => [f, await readFile(join(dir, 'ideas', f), 'utf8')])),
    };
  }
  const [owner, repo] = ROOT_REPO.split('/');
  const listing = (await gh('/repos/' + owner + '/' + repo + '/contents/ideas')) || [];
  const files = listing.filter((f) => f.type === 'file' && f.name.endsWith('.md') && f.name !== 'README.md');
  return {
    gitmodules: (await fileOf(owner, repo, '.gitmodules')) || '',
    ideas: await Promise.all(files.map(async (f) => [f.name, await fileOf(owner, repo, 'ideas/' + f.name)])),
  };
}

export async function collect() {
  const thumbDir = join(HERE, 'img', 'exhibits');
  await rm(thumbDir, { recursive: true, force: true });
  await mkdir(thumbDir, { recursive: true });
  await mkdir(join(HERE, 'data'), { recursive: true });

  const root = await rootFiles();
  const repos = parseGitmodules(root.gitmodules);
  const projects = [];
  for (const r of repos) projects.push(await project(r, thumbDir));
  const ideas = root.ideas.map(([f, text]) => parseIdea(f, text));
  const exhibits = buildExhibits({ projects, ideas });

  await writeFile(join(HERE, 'data', 'exhibits.js'), '/* Made by scripts/collect.mjs. Do not edit. */\nwindow.VM_EXHIBITS = ' + JSON.stringify(exhibits, null, 2) + ';\n');
  await writeFile(join(HERE, 'data', 'built-issues.json'), JSON.stringify(builtIssues(ideas)) + '\n');
  return exhibits;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  if (!process.env.ROOT_DIR && existsSync(join(HERE, '..', '..', '.gitmodules')) && process.env.CI !== 'true') {
    process.env.ROOT_DIR = join(HERE, '..', '..');
  }
  const list = await collect();
  for (const e of list) console.log(e.no, e.status.padEnd(8), e.id, e.version || e.noted || '', e.thumb || '');
}
