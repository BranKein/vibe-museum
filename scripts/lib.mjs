// Pure helpers for collecting the exhibits. No network or file access here, so the tests can drive them.

/** Repositories listed in a .gitmodules file, as { path, owner, repo }. Only GitHub URLs count. */
export function parseGitmodules(text) {
  const out = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[submodule')) {
      current = {};
      out.push(current);
      continue;
    }
    const m = /^(\w+)\s*=\s*(.+)$/.exec(line);
    if (m && current) current[m[1]] = m[2].trim();
  }
  return out
    .map((s) => {
      const gh = parseGithubUrl(s.url || '');
      return gh && { path: s.path, ...gh };
    })
    .filter(Boolean);
}

/** { owner, repo } from https://github.com/o/r(.git) or git@github.com:o/r.git, else null. */
export function parseGithubUrl(url) {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:[\s)]|$)/.exec(url + ' ');
  return m ? { owner: m[1], repo: m[2] } : null;
}

const SHOWN = { 아이디어: 'upcoming', 보류: 'upcoming', '구현 중': 'upcoming', 완료: 'done', 폐기: 'dropped' };

/**
 * Reads an idea file of the root repository's ideas/.
 * Header lines: "- 상태:", "- 작성일:", "- 저장소:", "- 출처:", and for the museum "- 전시 제목:", "- 전시 설명:",
 * "- 영어 제목:", "- 영어 설명:" (all optional; the title falls back to the "# " heading).
 * The Korean blurb falls back to the first paragraph of "## 개요".
 */
export function parseIdea(file, text) {
  const title = (/^#\s+(.+)$/m.exec(text) || [])[1] || file;
  const field = (name) => {
    const m = new RegExp('^-\\s*' + name + ':\\s*(.+)$', 'm').exec(text);
    return m ? m[1].trim() : '';
  };
  const status = field('상태');
  const overview = /^##\s*개요\s*\n+([^\n#][^\n]*(?:\n[^\n#][^\n]*)*)/m.exec(text);
  return {
    file,
    title: { ko: field('전시 제목') || title.trim(), en: field('영어 제목') || field('전시 제목') || title.trim() },
    blurb: { ko: field('전시 설명') || (overview ? overview[1].trim() : ''), en: field('영어 설명') || '' },
    status,
    kind: SHOWN[status] || 'unknown',
    noted: (/\d{4}-\d{2}-\d{2}/.exec(field('작성일')) || [''])[0],
    repo: parseGithubUrl(field('저장소')),
    // "- 출처: vive-museum#12" ties an idea to the visitor's issue, so the visitor hears when it is built.
    sourceIssue: Number((/vive-museum#(\d+)/.exec(field('출처')) || [])[1]) || null,
  };
}

/** The highest vMAJOR.MINOR.PATCH among tag names, or null. */
export function latestVersionTag(names) {
  const versions = names
    .map((n) => ({ n, m: /^v(\d+)\.(\d+)\.(\d+)$/.exec(n) }))
    .filter((v) => v.m)
    .sort((a, b) => {
      for (let i = 1; i <= 3; i += 1) if (Number(a.m[i]) !== Number(b.m[i])) return Number(b.m[i]) - Number(a.m[i]);
      return 0;
    });
  return versions.length ? versions[0].n : null;
}

/** The calendar date of an ISO timestamp in Korea, YYYY-MM-DD. */
export function seoulDate(iso) {
  const t = new Date(iso).getTime() + 9 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Days from the first commit to the first release, counting both ends (same day = 1). */
export function daysTaken(startDate, endDate) {
  const ms = Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z');
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function both(value, fallback) {
  if (value && typeof value === 'object') return { ko: value.ko || value.en || fallback, en: value.en || value.ko || fallback };
  return { ko: value || fallback, en: value || fallback };
}

/** "4:3", 1.333 or nothing to a width/height ratio. */
export function aspectOf(value) {
  if (typeof value === 'number' && value > 0) return value;
  const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(String(value || ''));
  return m ? Number(m[1]) / Number(m[2]) : 4 / 3;
}

/**
 * Builds the list the halls draw.
 * projects: [{ owner, repo, exhibit, site, version, deployed, started, firstRelease, thumb }] from the submodules
 *   (exhibit is the parsed deploy/exhibit.json or null; version null if never tagged).
 * ideas: parseIdea() results. self: repo name of the museum, never shown.
 */
export function buildExhibits({ projects, ideas, self, domain = 'yeonhyuk.me' }) {
  const live = [];
  const shownRepos = new Set();
  for (const p of projects) {
    if (p.repo === self || !p.exhibit || !p.version || !p.site || !p.site.subdomain) continue;
    const ex = p.exhibit;
    shownRepos.add(p.repo.toLowerCase());
    live.push({
      id: ex.id || p.repo.replace(/^vive-/, ''),
      status: 'live',
      title: both(ex.title, p.repo),
      blurb: both(ex.blurb, ''),
      url: 'https://' + p.site.subdomain + '.' + domain,
      repo: 'https://github.com/' + p.owner + '/' + p.repo,
      version: p.version,
      deployed: p.deployed,
      started: p.started,
      days: p.started ? daysTaken(p.started, p.firstRelease || p.deployed) : null,
      stack: Array.isArray(ex.stack) ? ex.stack : [],
      pcOnly: Boolean(ex.pcOnly),
      thumb: p.thumb || null,
      aspect: aspectOf(ex.aspect),
    });
  }
  const upcoming = ideas
    .filter((i) => i.kind === 'upcoming')
    .filter((i) => !i.repo || (i.repo.repo !== self && !shownRepos.has(i.repo.repo.toLowerCase())))
    .map((i) => ({
      id: i.file.replace(/\.md$/, ''),
      status: 'upcoming',
      title: i.title,
      blurb: { ko: i.blurb.ko, en: i.blurb.en || i.blurb.ko },
      noted: i.noted,
      stack: [],
      pcOnly: false,
      aspect: 4 / 3,
    }));
  // Accession numbers follow the order things were started, so they rarely change.
  const all = live.concat(upcoming);
  const rank = (e) => (e.status === 'live' ? 0 : 1);
  const byStart = all.slice().sort((a, b) => (a.started || a.noted || '').localeCompare(b.started || b.noted || '') || rank(a) - rank(b) || a.id.localeCompare(b.id));
  byStart.forEach((e, i) => { e.no = 'VM-' + String(i + 1).padStart(3, '0'); });
  live.sort((a, b) => (b.deployed || '').localeCompare(a.deployed || ''));
  upcoming.sort((a, b) => (b.noted || '').localeCompare(a.noted || ''));
  return live.concat(upcoming);
}

/** Issue numbers of visitor ideas that are now built: the visitor gets one email for each. */
export function builtIssues(ideas) {
  return ideas.filter((i) => i.kind === 'done' && i.sourceIssue).map((i) => i.sourceIssue);
}

/** HTML-escapes text for attributes and element bodies. */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Open Graph and Twitter tags for a page. */
export function ogTags({ title, description, url, image }) {
  const tags = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Vive Museum'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', url],
    ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
    ['name', 'description', description],
  ];
  if (image) tags.push(['property', 'og:image', image]);
  return tags.map(([attr, key, value]) => '<meta ' + attr + '="' + key + '" content="' + esc(value) + '">').join('\n');
}

/** The Cloudflare Web Analytics beacon, or nothing without a token. */
export function analyticsTag(token) {
  if (!token) return '';
  return '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'' + JSON.stringify({ token }) + '\'></script>';
}
