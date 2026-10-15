import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from '../lambda/ideas/app.mjs';
import { makeToken, readToken, reviewMail, validateIdea } from '../lambda/ideas/core.mjs';

function setup({ turnstileSecret = 'ts', githubToken = 'gh', turnstileOk = true } = {}) {
  const store = new Map();
  const sent = [];
  const issues = [];
  let clock = 1_800_000_000;
  const db = {
    async get(pk) { return store.has(pk) ? structuredClone(store.get(pk)) : null; },
    async put(item) { store.set(item.pk, structuredClone(item)); },
    async del(pk) { store.delete(pk); },
    async scan() { return [...store.values()].map((v) => structuredClone(v)); },
    async increment(pk, ttl) { const cur = store.get(pk) || { pk, count: 0 }; cur.count += 1; cur.ttl = ttl; store.set(pk, cur); return cur.count; },
  };
  const app = makeApp({
    db,
    mail: { async send(m) { if (m.to === 'bounce@x.io') throw Object.assign(new Error('no'), { name: 'MessageRejected' }); sent.push(m); } },
    github: { async createIssue(issue) { issues.push(issue); return 40 + issues.length; } },
    turnstile: { async verify(token) { return turnstileOk && token === 'good'; } },
    secrets: async () => ({ tokenSecret: 'secret', turnstileSecret, githubToken }),
    config: { apiBase: 'https://api.test', siteUrl: 'https://museum.test', ownerEmail: 'owner@x.io', issueRepo: 'BranKein/vive-museum' },
    now: () => clock,
    log: () => {},
  });
  return { app, store, sent, issues, tick: (s) => { clock += s; } };
}

const post = (body, ip = '1.2.3.4') => ({
  rawPath: '/ideas', requestContext: { http: { method: 'POST', sourceIp: ip } }, body: JSON.stringify(body),
});
const tokenIn = (text, path) => decodeURIComponent(new RegExp('https://api\\.test' + path + '\\?t=([^&\\s"]+)').exec(text)[1]);
const get = (path, t, extra = '') => ({ rawPath: path, requestContext: { http: { method: 'GET' } }, queryStringParameters: { t, ...Object.fromEntries(new URLSearchParams(extra)) } });
const form = (path, fields) => ({ rawPath: path, requestContext: { http: { method: 'POST' } }, body: new URLSearchParams(fields).toString() });
const ideas = (store) => [...store.values()].filter((v) => v.pk.startsWith('idea#'));

test('validateIdea checks the fields', () => {
  assert.equal(validateIdea({ title: ' ', description: 'x' }).error, 'missing');
  assert.equal(validateIdea({ title: 'x'.repeat(101), description: 'x' }).error, 'too-long');
  assert.equal(validateIdea({ title: 't', description: 'd', email: 'nope' }).error, 'email');
  assert.deepEqual(validateIdea({ title: ' t ', description: 'd', email: 'A@B.io', lang: 'en' }).idea, { title: 't', description: 'd', email: 'a@b.io', lang: 'en' });
});

test('tokens are signed', () => {
  const t = makeToken('s', { id: 'i', action: 'review', nonce: 'n' });
  assert.deepEqual(readToken('s', t), { id: 'i', action: 'review', nonce: 'n' });
  assert.equal(readToken('other', t), null);
  assert.equal(readToken('s', t.slice(0, -2) + 'xx'), null);
  assert.equal(readToken('s', 'garbage'), null);
});

test('an idea without email: owner mail, approve makes an issue and forgets it', async () => {
  const { app, store, sent, issues } = setup();
  const res = await app(post({ title: '퍼즐 게임', description: '매일 하나', turnstileToken: 'good' }));
  assert.equal(res.statusCode, 202);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@x.io');
  assert.match(sent[0].subject, /\[Vive Museum\] 새 아이디어: 퍼즐 게임/);
  const t = tokenIn(sent[0].text, '/review');

  // Opening the link only shows a page.
  const view = await app(get('/review', t, 'd=approve'));
  assert.equal(view.statusCode, 200);
  assert.match(view.body, /퍼즐 게임/);
  assert.equal(issues.length, 0);

  const done = await app(form('/review', { t, d: 'approve' }));
  assert.equal(done.statusCode, 200);
  assert.deepEqual(issues[0].labels, ['visitor-idea']);
  assert.equal(issues[0].title, '퍼즐 게임');
  assert.equal(ideas(store).length, 0);

  // The link works once.
  assert.equal((await app(form('/review', { t, d: 'approve' }))).statusCode, 410);
});

test('the issue never carries the email; the visitor confirms, then hears once when it is built', async () => {
  const { app, store, sent, issues } = setup();
  await app(post({ title: 'T', description: 'D', email: 'v@x.io', turnstileToken: 'good', lang: 'en' }));
  assert.equal(sent.length, 2);
  const [owner, visitor] = sent;
  assert.match(owner.text, /v@x\.io/);
  assert.equal(visitor.to, 'v@x.io');
  assert.match(visitor.subject, /Confirm your email/);

  const confirm = tokenIn(visitor.text, '/confirm');
  assert.equal((await app(get('/confirm', confirm))).statusCode, 200);
  assert.equal(ideas(store)[0].emailConfirmed, false);
  await app(form('/confirm', { t: confirm, d: 'confirm' }));
  assert.equal(ideas(store)[0].emailConfirmed, true);

  await app(form('/review', { t: tokenIn(owner.text, '/review'), d: 'approve' }));
  assert.doesNotMatch(JSON.stringify(issues[0]), /v@x\.io/);
  assert.equal(ideas(store)[0].status, 'approved');
  assert.equal(ideas(store)[0].ttl, undefined);

  const result = await app({ task: 'built', issues: [41, 99] });
  assert.deepEqual(result, { sent: 1, skipped: 1 });
  assert.equal(sent[2].to, 'v@x.io');
  assert.match(sent[2].subject, /built/);
  assert.match(sent[2].text, /Unsubscribe: https:\/\/api\.test\/unsubscribe/);
  assert.equal(store.size, 1); // only the rate counter is left
  assert.deepEqual(await app({ task: 'built', issues: [41] }), { sent: 0, skipped: 1 });
});

test('reject deletes the idea and its email', async () => {
  const { app, store, sent } = setup();
  await app(post({ title: 'T', description: 'D', email: 'v@x.io', turnstileToken: 'good' }));
  const page = await app(get('/review', tokenIn(sent[0].text, '/review'), 'd=reject'));
  assert.match(page.body, /거절: 지우기/);
  await app(form('/review', { t: tokenIn(sent[0].text, '/review'), d: 'reject' }));
  assert.equal(ideas(store).length, 0);
});

test('an address not confirmed in 24 hours is dropped, the idea stays', async () => {
  const { app, store, tick } = setup();
  await app(post({ title: 'T', description: 'D', email: 'v@x.io', turnstileToken: 'good' }));
  assert.deepEqual(await app({ task: 'cleanup' }), { dropped: 0 });
  tick(24 * 3600 + 1);
  assert.deepEqual(await app({ task: 'cleanup' }), { dropped: 1 });
  const [idea] = ideas(store);
  assert.equal(idea.email, undefined);
  assert.equal(idea.status, 'pending');
});

test('unsubscribe drops the address', async () => {
  const { app, store, sent } = setup();
  await app(post({ title: 'T', description: 'D', email: 'v@x.io', turnstileToken: 'good' }));
  const t = tokenIn(sent[1].text, '/unsubscribe');
  await app(form('/unsubscribe', { t, d: 'unsub' }));
  assert.equal(ideas(store)[0].email, undefined);
  assert.equal((await app(get('/unsubscribe', t))).statusCode, 410);
});

test('spam guards: Turnstile, five an hour per address, bad input', async () => {
  const { app, tick } = setup();
  assert.equal((await app(post({ title: 'T', description: 'D', turnstileToken: 'bad' }))).statusCode, 403);
  assert.equal((await app(post({ title: '', description: 'D', turnstileToken: 'good' }))).statusCode, 400);
  for (let i = 0; i < 3; i += 1) assert.equal((await app(post({ title: 'T', description: 'D', turnstileToken: 'good' }))).statusCode, 202);
  assert.equal((await app(post({ title: 'T', description: 'D', turnstileToken: 'good' }))).statusCode, 202);
  assert.equal((await app(post({ title: 'T', description: 'D', turnstileToken: 'good' }))).statusCode, 429);
  assert.equal((await app(post({ title: 'T', description: 'D', turnstileToken: 'good' }, '5.6.7.8'))).statusCode, 202);
  tick(3600);
  assert.equal((await app(post({ title: 'T', description: 'D', turnstileToken: 'good' }))).statusCode, 202);
});

test('without a Turnstile secret the check is skipped; a failed visitor mail still keeps the idea', async () => {
  const { app, store } = setup({ turnstileSecret: '' });
  assert.equal((await app(post({ title: 'T', description: 'D', email: 'bounce@x.io' }))).statusCode, 202);
  assert.equal(ideas(store).length, 1);
});

test('approving without a GitHub token keeps the idea for later', async () => {
  const { app, store, sent } = setup({ githubToken: '' });
  await app(post({ title: 'T', description: 'D', turnstileToken: 'good' }));
  const t = tokenIn(sent[0].text, '/review');
  assert.equal((await app(form('/review', { t, d: 'approve' }))).statusCode, 503);
  assert.equal(ideas(store).length, 1);
});

test('unknown routes are 404', async () => {
  const { app } = setup();
  assert.equal((await app({ rawPath: '/x', requestContext: { http: { method: 'GET' } } })).statusCode, 404);
});

test('the test review mail says it is a test', () => {
  const m = reviewMail({ idea: { title: '가짜', description: '설명', email: 'v@x.io' }, reviewUrl: 'https://api.test/review?t=x', test: true });
  assert.match(m.subject, /^\[Vive Museum\] 테스트 · 새 아이디어: 가짜$/);
  assert.match(m.text, /승인: https:\/\/api\.test\/review\?t=x&d=approve/);
  assert.match(m.html, /거절/);
});
