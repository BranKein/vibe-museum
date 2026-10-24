// The visitor idea function. Routes (HTTP API, payload 2.0):
//   POST /ideas                     a visitor leaves an idea (JSON: title, description, email?, turnstileToken, lang)
//   GET|POST /review?t=&d=          the owner approves (issue in vibe-museum) or rejects (deleted)
//   GET|POST /confirm?t=            a visitor confirms their address
//   GET|POST /unsubscribe?t=        a visitor drops their address
// Direct invocations (no HTTP):
//   { task: 'cleanup' }             hourly: drop addresses not confirmed within 24 hours
//   { task: 'built', issues: [n] }  from the museum deploy: tell visitors their idea is built, then forget them
// GET only shows a page; the work happens on the page's POST, since mail scanners open links.
import {
  KEEP, LIMITS, actionPage, builtMail, confirmMail, copy, dayKey, formOf, ideaBox, ipKey, issueOf, jsonOf, makeToken,
  newId, newNonce, page, readToken, reviewMail, validateIdea,
} from './core.mjs';

const ideaKey = (id) => 'idea#' + id;
const issueKey = (n) => 'issue#' + n;

function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
function html(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body };
}

/**
 * deps: db { get(pk), put(item), del(pk), scan(), increment(pk, ttl) }, mail { send({ to, subject, text, html }) },
 * github { createIssue({ title, body, labels }) → number }, turnstile { verify(token, ip) → boolean },
 * secrets() → { tokenSecret, turnstileSecret, githubToken }, config { apiBase, siteUrl, ownerEmail }, now() → seconds,
 * log(...)
 */
export function makeApp(deps) {
  const { db, mail, github, turnstile, config } = deps;
  const now = deps.now || (() => Math.floor(Date.now() / 1000));
  const log = deps.log || console.log;

  async function link(path, id, action, nonce) {
    const { tokenSecret } = await deps.secrets();
    return config.apiBase + path + '?t=' + encodeURIComponent(makeToken(tokenSecret, { id, action, nonce }));
  }

  /** The idea a token is for, if the token is good and not used yet. */
  async function ideaFor(token, action) {
    const { tokenSecret } = await deps.secrets();
    const t = readToken(tokenSecret, token);
    if (!t || t.action !== action) return null;
    const idea = await db.get(ideaKey(t.id));
    if (!idea || !idea.nonces || idea.nonces[action] !== t.nonce) return null;
    return idea;
  }

  async function forget(idea) {
    await db.del(ideaKey(idea.id));
    if (idea.issue) await db.del(issueKey(idea.issue));
  }

  async function submit(event) {
    const body = jsonOf(event);
    const checked = validateIdea(body);
    if (checked.error) return json(400, { error: checked.error, limits: LIMITS });
    const secrets = await deps.secrets();
    const ip = (event.requestContext && event.requestContext.http && event.requestContext.http.sourceIp) || 'unknown';
    const t = now();
    const count = await db.increment(ipKey(secrets.tokenSecret, ip, t), t + 2 * 3600);
    if (count > LIMITS.perHour) return json(429, { error: 'rate' });
    if (secrets.turnstileSecret) {
      if (!(await turnstile.verify(String(body.turnstileToken || ''), ip))) return json(403, { error: 'turnstile' });
    } else {
      log('turnstile secret not set; skipping the human check');
    }
    // A ceiling for the whole site, so a flood can never turn into a flood of mail (or a bill).
    const perDay = config.dailyLimit || LIMITS.perDay;
    if ((await db.increment(dayKey(t), t + 2 * 86400)) > perDay) {
      log('daily idea limit reached', perDay);
      return json(429, { error: 'daily' });
    }

    const idea = {
      pk: ideaKey(newId()),
      ...checked.idea,
      emailConfirmed: false,
      status: 'pending',
      createdAt: t,
      ttl: t + KEEP.idea,
      nonces: { review: newNonce() },
    };
    idea.id = idea.pk.slice(5);
    if (idea.email) {
      idea.nonces.confirm = newNonce();
      idea.nonces.unsub = newNonce();
      idea.emailExpires = t + KEEP.unconfirmedEmail;
    }
    await db.put(idea);

    const review = reviewMail({ idea, reviewUrl: await link('/review', idea.id, 'review', idea.nonces.review) });
    await mail.send({ to: config.ownerEmail, ...review });
    if (idea.email) {
      const confirm = confirmMail({
        idea,
        confirmUrl: await link('/confirm', idea.id, 'confirm', idea.nonces.confirm),
        unsubscribeUrl: await link('/unsubscribe', idea.id, 'unsub', idea.nonces.unsub),
      });
      try {
        await mail.send({ to: idea.email, ...confirm });
      } catch (err) {
        // In the SES sandbox only verified addresses get mail. The idea still counts.
        log('confirmation mail failed', err && err.name);
      }
    }
    return json(202, { ok: true });
  }

  async function review(event, method) {
    const params = method === 'POST' ? formOf(event) : event.queryStringParameters || {};
    const idea = await ideaFor(params.t, 'review');
    if (!idea) return html(410, page({ title: '검토', body: '<p>이미 처리했거나 기한이 지난 아이디어입니다.</p>', siteUrl: config.siteUrl }));
    if (method === 'GET') {
      const approveFirst = params.d !== 'reject';
      const buttons = [
        { value: 'approve', label: '승인: 이슈 만들기', kind: approveFirst ? 'ok' : 'plain' },
        { value: 'reject', label: '거절: 지우기', kind: approveFirst ? 'plain' : 'no' },
      ];
      return html(200, actionPage({
        title: '아이디어 검토', intro: '승인하면 vibe-museum에 visitor-idea 이슈(제목·설명만)를 만들고, 거절하면 지웁니다.',
        detail: ideaBox(idea), token: params.t, path: '/review', buttons: approveFirst ? buttons : buttons.reverse(), lang: 'ko', siteUrl: config.siteUrl,
      }));
    }
    if (params.d === 'reject') {
      await forget(idea);
      return html(200, page({ title: '거절했습니다', body: '<p>아이디어와 이메일을 지웠습니다. 방문자에게는 알리지 않습니다.</p>', siteUrl: config.siteUrl }));
    }
    if (params.d !== 'approve') return html(400, page({ title: '검토', body: '<p>승인이나 거절을 골라 주세요.</p>' }));
    const { githubToken } = await deps.secrets();
    if (!githubToken) {
      return html(503, page({ title: '이슈를 만들지 못했습니다', body: '<p>GitHub 토큰이 아직 설정되지 않았습니다. 아이디어는 그대로 두었으니 토큰을 넣은 뒤 같은 링크로 다시 승인하세요.</p>' }));
    }
    const number = await github.createIssue(issueOf(idea));
    const { review: _used, ...nonces } = idea.nonces;
    if (idea.email) {
      // Kept until the idea is built, so the visitor can hear about it.
      const { ttl: _ttl, ...rest } = idea;
      await db.put({ ...rest, status: 'approved', issue: number, nonces });
      await db.put({ pk: issueKey(number), ideaId: idea.id });
    } else {
      await db.del(ideaKey(idea.id));
    }
    const url = 'https://github.com/' + config.issueRepo + '/issues/' + number;
    return html(200, page({ title: '승인했습니다', body: '<p>이슈를 만들었습니다: <a href="' + url + '">#' + number + '</a></p>', siteUrl: config.siteUrl }));
  }

  async function visitorAction(event, method, action) {
    const params = method === 'POST' ? formOf(event) : event.queryStringParameters || {};
    const idea = await ideaFor(params.t, action);
    const lang = (idea && idea.lang) || 'ko';
    const c = copy(lang);
    const isConfirm = action === 'confirm';
    if (!idea || !idea.email) return html(410, page({ title: isConfirm ? c.confirmTitle : c.unsubTitle, body: '<p>' + c.used + '</p>', lang, siteUrl: config.siteUrl }));
    if (method === 'GET') {
      return html(200, actionPage({
        title: isConfirm ? c.confirmTitle : c.unsubTitle, intro: isConfirm ? c.confirmAsk : c.unsubAsk, token: params.t,
        path: isConfirm ? '/confirm' : '/unsubscribe', buttons: [{ value: action, label: isConfirm ? c.confirmBtn : c.unsubBtn, kind: isConfirm ? 'ok' : 'no' }],
        lang, siteUrl: config.siteUrl,
      }));
    }
    if (isConfirm) {
      const { confirm: _used, ...nonces } = idea.nonces;
      const { emailExpires: _e, ...rest } = idea;
      await db.put({ ...rest, emailConfirmed: true, nonces });
      return html(200, page({ title: c.confirmTitle, body: '<p>' + c.confirmDone + '</p>', lang, siteUrl: config.siteUrl }));
    }
    await dropEmail(idea);
    return html(200, page({ title: c.unsubTitle, body: '<p>' + c.unsubDone + '</p>', lang, siteUrl: config.siteUrl }));
  }

  /** Forgets the visitor's address. An approved idea has nothing left to do then, so it goes too. */
  async function dropEmail(idea) {
    if (idea.status === 'approved') return forget(idea);
    const { email: _m, emailExpires: _e, emailConfirmed: _c, ...rest } = idea;
    const { confirm: _a, unsub: _b, ...nonces } = idea.nonces || {};
    await db.put({ ...rest, emailConfirmed: false, nonces });
  }

  async function cleanup() {
    const t = now();
    let dropped = 0;
    for (const item of await db.scan()) {
      if (!item.pk.startsWith('idea#') || !item.email || item.emailConfirmed || !(item.emailExpires < t)) continue;
      await dropEmail(item);
      dropped += 1;
    }
    return { dropped };
  }

  async function built(issues) {
    const result = { sent: 0, skipped: 0 };
    for (const n of issues || []) {
      const pointer = await db.get(issueKey(n));
      const idea = pointer && (await db.get(ideaKey(pointer.ideaId)));
      if (!idea) {
        if (pointer) await db.del(issueKey(n));
        result.skipped += 1;
        continue;
      }
      if (idea.email && idea.emailConfirmed) {
        const unsub = await link('/unsubscribe', idea.id, 'unsub', (idea.nonces && idea.nonces.unsub) || newNonce());
        await mail.send({ to: idea.email, ...builtMail({ idea, museumUrl: config.siteUrl, unsubscribeUrl: unsub }) });
        result.sent += 1;
      } else {
        result.skipped += 1;
      }
      // One mail per idea, then the address is gone.
      await forget(idea);
    }
    return result;
  }

  return async function handler(event) {
    if (event && event.task === 'cleanup') return cleanup();
    if (event && event.task === 'built') return built(event.issues);
    const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method) || 'GET';
    const path = event.rawPath || '/';
    try {
      if (path === '/ideas' && method === 'POST') return await submit(event);
      if (path === '/review' && (method === 'GET' || method === 'POST')) return await review(event, method);
      if (path === '/confirm' && (method === 'GET' || method === 'POST')) return await visitorAction(event, method, 'confirm');
      if (path === '/unsubscribe' && (method === 'GET' || method === 'POST')) return await visitorAction(event, method, 'unsub');
      return json(404, { error: 'not-found' });
    } catch (err) {
      log('failed', path, err && (err.stack || err.message));
      return json(500, { error: 'server' });
    }
  };
}
