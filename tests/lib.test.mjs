import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsTag, aspectOf, buildExhibits, builtIssues, daysTaken, latestVersionTag, ogTags, parseGitmodules, parseGithubUrl, parseIdea, seoulDate,
} from '../scripts/lib.mjs';

test('parseGitmodules keeps GitHub repositories', () => {
  const text = `[submodule "projects/a"]
\tpath = projects/a
\turl = https://github.com/BranKein/vive-a.git
[submodule "projects/b"]
\tpath = projects/b
\turl = git@github.com:BranKein/vive-b.git
[submodule "x"]
\tpath = x
\turl = https://gitlab.com/o/x.git
`;
  assert.deepEqual(parseGitmodules(text), [
    { path: 'projects/a', owner: 'BranKein', repo: 'vive-a' },
    { path: 'projects/b', owner: 'BranKein', repo: 'vive-b' },
  ]);
});

test('parseGithubUrl reads a link with a trailing note', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/BranKein/vive-infra (비공개, `projects/infra`)'), { owner: 'BranKein', repo: 'vive-infra' });
  assert.equal(parseGithubUrl('(구현 시작 후 링크)'), null);
});

const IDEA = `# 주기적 코딩 문제 생성 및 구독 알림

- 상태: 아이디어
- 작성일: 2026-10-12
- 저장소: (구현 시작 후 링크)
- 전시 제목: 주기적 코딩 문제
- 영어 제목: Problem of the Week
- 영어 설명: Problems on a schedule.
- 출처: vive-museum#12

## 개요

일정 주기마다 문제를 만든다.
두 번째 줄.

## 요구사항
`;

test('parseIdea reads the header lines and falls back to the overview', () => {
  const idea = parseIdea('periodic.md', IDEA);
  assert.deepEqual(idea.title, { ko: '주기적 코딩 문제', en: 'Problem of the Week' });
  assert.deepEqual(idea.blurb, { ko: '일정 주기마다 문제를 만든다.\n두 번째 줄.', en: 'Problems on a schedule.' });
  assert.equal(idea.kind, 'upcoming');
  assert.equal(idea.noted, '2026-10-12');
  assert.equal(idea.repo, null);
  assert.equal(idea.sourceIssue, 12);
});

test('parseIdea maps every status', () => {
  const kind = (s) => parseIdea('x.md', `# X\n\n- 상태: ${s}\n`).kind;
  assert.equal(kind('보류'), 'upcoming');
  assert.equal(kind('구현 중'), 'upcoming');
  assert.equal(kind('완료'), 'done');
  assert.equal(kind('폐기'), 'dropped');
});

test('latestVersionTag sorts by number, not text', () => {
  assert.equal(latestVersionTag(['v1.0.4', 'v1.0.10', 'v1.0.9', 'warehouse/v2.0.0', 'v0.9.0']), 'v1.0.10');
  assert.equal(latestVersionTag(['release', 'v1']), null);
});

test('dates are counted in Korea, both ends included', () => {
  assert.equal(seoulDate('2026-10-14T16:30:00Z'), '2026-10-15');
  assert.equal(daysTaken('2026-10-12', '2026-10-14'), 3);
  assert.equal(daysTaken('2026-10-12', '2026-10-12'), 1);
});

test('aspectOf reads ratios', () => {
  assert.equal(aspectOf('16:9'), 16 / 9);
  assert.equal(aspectOf(1.5), 1.5);
  assert.equal(aspectOf(undefined), 4 / 3);
});

const PROJECT = {
  owner: 'BranKein', repo: 'vive-warehouse-tycoon',
  exhibit: { title: { ko: '창고', en: 'Warehouse' }, blurb: { ko: '설명', en: 'About' }, stack: ['TS'], pcOnly: true, aspect: '4:3' },
  site: { subdomain: 'warehouse-tycoon' }, version: 'v1.0.4', deployed: '2026-10-15', started: '2026-10-12', firstRelease: '2026-10-14',
  thumb: 'img/exhibits/warehouse-tycoon.jpg',
};

test('buildExhibits: live from the projects, upcoming from the ideas, the museum left out', () => {
  const ideas = [
    parseIdea('periodic.md', IDEA),
    parseIdea('museum.md', '# 박물관\n\n- 상태: 구현 중\n- 작성일: 2026-10-12\n- 저장소: https://github.com/BranKein/vive-museum\n'),
    parseIdea('warehouse.md', '# 창고\n\n- 상태: 구현 중\n- 작성일: 2026-10-11\n- 저장소: https://github.com/BranKein/vive-warehouse-tycoon\n'),
    parseIdea('old.md', '# 옛것\n\n- 상태: 폐기\n- 작성일: 2026-10-01\n'),
    parseIdea('later.md', '# 나중\n\n- 상태: 보류\n- 작성일: 2026-10-13\n'),
  ];
  const projects = [
    PROJECT,
    { owner: 'BranKein', repo: 'vive-infra', exhibit: null },
    { owner: 'BranKein', repo: 'vive-museum', exhibit: { title: 'M' }, site: { subdomain: 'vive-museum' }, version: 'v0.0.1' },
    { owner: 'BranKein', repo: 'vive-untagged', exhibit: { title: 'U' }, site: { subdomain: 'u' }, version: null },
  ];
  const list = buildExhibits({ projects, ideas, self: 'vive-museum' });
  assert.deepEqual(list.map((e) => e.id), ['warehouse-tycoon', 'later', 'periodic']);
  const [live] = list;
  assert.equal(live.url, 'https://warehouse-tycoon.yeonhyuk.me');
  assert.equal(live.repo, 'https://github.com/BranKein/vive-warehouse-tycoon');
  assert.equal(live.days, 3);
  assert.equal(live.aspect, 4 / 3);
  assert.equal(live.no, 'VM-001');
  assert.equal(list[2].no, 'VM-002');
  assert.equal(list[1].no, 'VM-003');
  assert.deepEqual(list[2].title, { ko: '주기적 코딩 문제', en: 'Problem of the Week' });
});

test('buildExhibits: a project without v1.0.0 counts days to its latest release', () => {
  const [e] = buildExhibits({ projects: [{ ...PROJECT, firstRelease: null }], ideas: [], self: 'vive-museum' });
  assert.equal(e.days, 4);
});

test('builtIssues lists finished ideas that came from a visitor', () => {
  const done = parseIdea('d.md', '# D\n\n- 상태: 완료\n- 출처: vive-museum#7\n');
  const open = parseIdea('o.md', '# O\n\n- 상태: 아이디어\n- 출처: vive-museum#8\n');
  assert.deepEqual(builtIssues([done, open]), [7]);
});

test('ogTags escapes and analyticsTag needs a token', () => {
  const tags = ogTags({ title: 'A "B"', description: 'x<y', url: 'https://e', image: 'https://e/i.png' });
  assert.match(tags, /og:title" content="A &quot;B&quot;"/);
  assert.match(tags, /content="x&lt;y"/);
  assert.match(tags, /og:image/);
  assert.equal(analyticsTag(''), '');
  assert.match(analyticsTag('abc'), /data-cf-beacon='\{"token":"abc"\}'/);
});
