// The parts of the idea function that need no AWS: checking input, signing links, and writing pages and mails.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const LIMITS = { title: 100, description: 2000, email: 254, perHour: 5, perDay: 50 };

/** Counter of ideas taken on one UTC day, across all visitors. */
export function dayKey(now) {
  return 'day#' + new Date(now * 1000).toISOString().slice(0, 10);
}
export const HOUR = 3600;
export const DAY = 24 * HOUR;
/** An unanswered idea is deleted after 30 days; an unconfirmed email after 24 hours. */
export const KEEP = { idea: 30 * DAY, unconfirmedEmail: DAY };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Cleans a submitted idea, or says what is wrong with it. */
export function validateIdea(body) {
  const title = String((body && body.title) || '').trim();
  const description = String((body && body.description) || '').trim();
  const email = String((body && body.email) || '').trim().toLowerCase();
  const lang = body && body.lang === 'en' ? 'en' : 'ko';
  if (!title || !description) return { error: 'missing' };
  if (title.length > LIMITS.title || description.length > LIMITS.description) return { error: 'too-long' };
  if (email && (email.length > LIMITS.email || !EMAIL.test(email))) return { error: 'email' };
  return { idea: { title, description, email: email || null, lang } };
}

export function newId() {
  return randomBytes(9).toString('base64url');
}

export function newNonce() {
  return randomBytes(12).toString('base64url');
}

function sign(secret, text) {
  return createHmac('sha256', secret).update(text).digest('base64url');
}

/** A link token for one action on one idea. It works once: the idea keeps the nonce and drops it when used. */
export function makeToken(secret, { id, action, nonce }) {
  const body = Buffer.from(JSON.stringify({ i: id, a: action, n: nonce })).toString('base64url');
  return body + '.' + sign(secret, body);
}

/** { id, action, nonce } if the signature holds, else null. The caller still checks the nonce. */
export function readToken(secret, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(secret, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { i, a, n } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return i && a && n ? { id: i, action: a, nonce: n } : null;
  } catch {
    return null;
  }
}

/** A short hash of the visitor's address for counting requests, so the address itself is not kept. */
export function ipKey(secret, ip, now) {
  return 'rate#' + sign(secret, String(ip)).slice(0, 16) + '#' + Math.floor(now / HOUR);
}

export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const COPY = {
  ko: {
    confirmTitle: '이메일 확인',
    confirmAsk: '이 주소로 아이디어가 만들어졌을 때 한 번 알림을 받습니다.',
    confirmBtn: '확인',
    confirmDone: '확인했습니다. 아이디어가 만들어지면 알려 드리겠습니다.',
    unsubTitle: '수신 거부',
    unsubAsk: '이 아이디어에 대한 알림을 받지 않고 이메일 주소를 지웁니다.',
    unsubBtn: '수신 거부',
    unsubDone: '이메일 주소를 지웠습니다. 더는 메일을 보내지 않습니다.',
    used: '이미 쓴 링크이거나 기한이 지난 링크입니다.',
    back: '박물관으로',
  },
  en: {
    confirmTitle: 'Confirm your email',
    confirmAsk: 'You will get one email at this address when the idea is built.',
    confirmBtn: 'Confirm',
    confirmDone: 'Confirmed. We will let you know when it is built.',
    unsubTitle: 'Unsubscribe',
    unsubAsk: 'Stop emails about this idea and delete your address.',
    unsubBtn: 'Unsubscribe',
    unsubDone: 'Your address is deleted. No more emails.',
    used: 'This link was already used or has expired.',
    back: 'Back to the museum',
  },
};

export function copy(lang) {
  return COPY[lang === 'en' ? 'en' : 'ko'];
}

/** A small page. Every link opens one of these first; only its button does the work (mail scanners open links). */
export function page({ title, body, lang = 'ko', siteUrl }) {
  return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(title) + ' · Vibe Museum</title><style>' +
    'body{margin:0;background:#fbfbfa;color:#17181a;font:400 16px/1.6 system-ui,sans-serif;word-break:keep-all}' +
    '@media (prefers-color-scheme:dark){body{background:#141517;color:#ececea}.box{background:#1d1e21!important;border-color:#2a2b2f!important}}' +
    'main{max-width:560px;margin:0 auto;padding:48px 16px}.box{background:#fff;border:1px solid #e2e2de;border-radius:14px;padding:20px;margin:16px 0}' +
    'h1{font-size:22px;margin:0 0 8px}button{font:600 15px system-ui,sans-serif;border:0;border-radius:999px;padding:10px 20px;cursor:pointer;margin:4px 8px 4px 0}' +
    '.ok{background:#2b55a3;color:#fff}.no{background:#c8423b;color:#fff}.plain{background:#e2e2de;color:#17181a}a{color:#2b55a3}pre{white-space:pre-wrap;font:inherit;margin:0}' +
    '</style></head><body><main><h1>' + esc(title) + '</h1>' + body +
    (siteUrl ? '<p><a href="' + esc(siteUrl) + '">' + esc(copy(lang).back) + '</a></p>' : '') + '</main></body></html>';
}

/** A page whose button posts the token back. */
export function actionPage({ title, intro, token, path, buttons, lang, siteUrl, detail = '' }) {
  const form = '<form method="post" action="' + esc(path) + '"><input type="hidden" name="t" value="' + esc(token) + '">' +
    buttons.map((b) => '<button class="' + b.kind + '" name="d" value="' + esc(b.value) + '">' + esc(b.label) + '</button>').join('') + '</form>';
  return page({ title, lang, siteUrl, body: '<p>' + esc(intro) + '</p>' + detail + form });
}

/** The idea as a box, for the owner's review page and mail. */
export function ideaBox(idea, { withEmail = true } = {}) {
  return '<div class="box"><b>' + esc(idea.title) + '</b><pre>' + esc(idea.description) + '</pre>' +
    (withEmail && idea.email ? '<p>방문자 이메일: ' + esc(idea.email) + (idea.emailConfirmed ? ' (확인됨)' : ' (확인 전)') + '</p>' : '') + '</div>';
}

/** The mail to the owner: the idea, the visitor's address if any, and approve/reject links. */
export function reviewMail({ idea, reviewUrl, test = false }) {
  const subject = '[Vibe Museum] ' + (test ? '테스트 · ' : '') + '새 아이디어: ' + idea.title;
  const approve = reviewUrl + '&d=approve';
  const reject = reviewUrl + '&d=reject';
  const text = [
    test ? '이 메일은 테스트입니다. 아래 아이디어는 가짜이고, 링크는 동작하지 않습니다.\n' : '',
    '방문자가 아이디어를 남겼습니다. 승인하면 vibe-museum 저장소에 visitor-idea 이슈(제목·설명만)를 만들고, 거절하면 지웁니다.',
    '30일 동안 아무것도 누르지 않으면 지웁니다.',
    '',
    '제목: ' + idea.title,
    '설명:',
    idea.description,
    '',
    idea.email ? '방문자 이메일: ' + idea.email + ' (이 메일에만 적습니다. 방문자가 확인 링크를 눌러야 알림 대상이 됩니다)' : '방문자 이메일: 없음',
    '',
    '승인: ' + approve,
    '거절: ' + reject,
    '',
    '링크는 확인 화면을 엽니다. 화면의 버튼을 눌러야 처리됩니다.',
  ].join('\n');
  const html = '<div style="font:15px/1.6 system-ui,sans-serif;max-width:560px">' +
    (test ? '<p style="background:#fff4d6;padding:8px 12px;border-radius:8px">이 메일은 테스트입니다. 아래 아이디어는 가짜이고, 링크는 동작하지 않습니다.</p>' : '') +
    '<p>방문자가 아이디어를 남겼습니다. 승인하면 vibe-museum 저장소에 <code>visitor-idea</code> 이슈(제목·설명만)를 만들고, 거절하면 지웁니다. 30일 동안 아무것도 누르지 않으면 지웁니다.</p>' +
    '<div style="border:1px solid #e2e2de;border-radius:12px;padding:14px 16px"><b>' + esc(idea.title) + '</b><p style="white-space:pre-wrap;margin:6px 0 0">' + esc(idea.description) + '</p></div>' +
    '<p>' + (idea.email ? '방문자 이메일: ' + esc(idea.email) + '<br><small>이 메일에만 적습니다. 방문자가 확인 링크를 눌러야 알림 대상이 됩니다.</small>' : '방문자 이메일: 없음') + '</p>' +
    '<p><a href="' + esc(approve) + '" style="background:#2b55a3;color:#fff;padding:9px 18px;border-radius:999px;text-decoration:none">승인</a> &nbsp; ' +
    '<a href="' + esc(reject) + '" style="background:#c8423b;color:#fff;padding:9px 18px;border-radius:999px;text-decoration:none">거절</a></p>' +
    '<p style="color:#6a6c70"><small>링크는 확인 화면을 엽니다. 화면의 버튼을 눌러야 처리됩니다.</small></p></div>';
  return { subject, text, html };
}

/** The mail to a visitor who left an address: confirm it, or drop it. */
export function confirmMail({ idea, confirmUrl, unsubscribeUrl }) {
  const en = idea.lang === 'en';
  const subject = en ? '[Vibe Museum] Confirm your email' : '[Vibe Museum] 이메일을 확인해 주세요';
  const lines = en
    ? ['Thank you for your idea "' + idea.title + '".', 'Confirm this address to get one email when it is built (within 24 hours):', confirmUrl, '', 'Did not send it? Ignore this mail, or delete the address now:', unsubscribeUrl]
    : ['"' + idea.title + '" 아이디어를 남겨 주셔서 고맙습니다.', '이 아이디어가 만들어졌을 때 한 번 알림을 받으려면 24시간 안에 주소를 확인해 주세요:', confirmUrl, '', '보낸 적이 없다면 이 메일을 무시하시거나, 지금 주소를 지울 수 있습니다:', unsubscribeUrl];
  return { subject, text: lines.join('\n'), html: '<div style="font:15px/1.6 system-ui,sans-serif">' + lines.map((l) => (/^https?:/.test(l) ? '<p><a href="' + esc(l) + '">' + esc(l) + '</a></p>' : '<p>' + esc(l) + '</p>')).join('') + '</div>' };
}

/** The one mail a visitor gets when their idea is built. */
export function builtMail({ idea, museumUrl, unsubscribeUrl }) {
  const en = idea.lang === 'en';
  const subject = en ? '[Vibe Museum] Your idea is built' : '[Vibe Museum] 남겨 주신 아이디어가 만들어졌습니다';
  const lines = en
    ? ['"' + idea.title + '" is built and on view at the museum:', museumUrl, '', 'This is the only email about it; your address is now deleted.', 'Unsubscribe: ' + unsubscribeUrl]
    : ['"' + idea.title + '" 아이디어가 만들어져 박물관에 걸렸습니다:', museumUrl, '', '이 아이디어에 대한 메일은 이것뿐이고, 주소는 이제 지웠습니다.', '수신 거부: ' + unsubscribeUrl];
  return { subject, text: lines.join('\n'), html: '<div style="font:15px/1.6 system-ui,sans-serif">' + lines.map((l) => '<p>' + esc(l).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>') + '</p>').join('') + '</div>' };
}

/** The issue made when the owner approves: title and description only, never the email. */
export function issueOf(idea) {
  return {
    title: idea.title,
    body: idea.description + '\n\n---\n방문자가 박물관에서 남긴 아이디어입니다. (A visitor left this idea at the museum.)',
    labels: ['visitor-idea'],
  };
}

/** Reads a form post (application/x-www-form-urlencoded, maybe base64). */
export function formOf(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  return Object.fromEntries(new URLSearchParams(raw));
}

export function jsonOf(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
