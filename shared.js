/* Shared by every draft: the real exhibits, both languages and the idea form. Each draft only draws them its own way. */
(function () {
  // Made at build time by scripts/collect.mjs (data/exhibits.js). Empty until it has run.
  var EXHIBITS = window.VM_EXHIBITS || [];
  // Made at build time by scripts/build.mjs (config.js). Without an API the idea form only shows a note.
  var CONFIG = window.VM_CONFIG || { ideasApi: '', turnstileSiteKey: '' };

  var STRINGS = {
    site: { ko: '바이브 뮤지엄', en: 'Vibe Museum' },
    tagline: { ko: '바이브 코딩으로 만든 것들을 모아 둔 작은 박물관', en: 'A small museum of things made by vibe coding' },
    live: { ko: '전시 중', en: 'On view' },
    upcoming: { ko: '준비 중', en: 'In preparation' },
    pcOnly: { ko: 'PC 권장', en: 'Best on desktop' },
    enter: { ko: '들어가기', en: 'Enter' },
    repo: { ko: '저장소', en: 'Source' },
    version: { ko: '버전', en: 'Version' },
    deployed: { ko: '마지막 배포', en: 'Last deployed' },
    stack: { ko: '기술', en: 'Built with' },
    made: { ko: '제작 기간', en: 'Made in' },
    noted: { ko: '아이디어 적은 날', en: 'Idea noted' },
    count: { ko: '전시 {live}점 · 준비 중 {up}점', en: '{live} on view · {up} in preparation' },
    formTitle: { ko: '아이디어 남기기', en: 'Leave an idea' },
    formIntro: {
      ko: '만들어 봤으면 하는 것을 적어 주세요. 검토해서 채택하면 이 박물관에 "준비 중"으로 걸립니다.',
      en: 'Tell us what you would like to see built. Ideas we take on go up here as "In preparation".',
    },
    fTitle: { ko: '제목', en: 'Title' },
    fDesc: { ko: '설명', en: 'Description' },
    fEmail: { ko: '이메일 (선택)', en: 'Email (optional)' },
    fEmailHint: {
      ko: '적으면 확인 메일을 보내고, 이 아이디어가 만들어지면 한 번 알려 드립니다. 이메일은 어디에도 공개되지 않습니다.',
      en: 'We send a confirmation link, then one email when this idea is built. Your address is never made public.',
    },
    fSend: { ko: '보내기', en: 'Send' },
    fNeed: { ko: '제목과 설명을 적어 주세요.', en: 'Add a title and a description.' },
    fBadEmail: { ko: '이메일 주소를 확인해 주세요. 비워 두어도 됩니다.', en: 'Check the email address, or leave it empty.' },
    fSent: {
      ko: '아직 아이디어를 받을 준비가 되지 않아 보내지 않았습니다. 곧 열겠습니다.',
      en: 'The idea box is not open yet, so nothing was sent. It opens soon.',
    },
    fSending: { ko: '보내는 중…', en: 'Sending…' },
    fThanks: { ko: '고맙습니다. 검토한 뒤 채택하면 이 박물관에 걸립니다.', en: 'Thank you. If we take it on, it goes up here.' },
    fThanksMail: {
      ko: '고맙습니다. 적어 주신 주소로 확인 메일을 보냈습니다. 링크를 눌러야 나중에 알림을 받습니다.',
      en: 'Thank you. We sent a confirmation link to your address; open it to hear back when this is built.',
    },
    fRobot: { ko: '사람인지 확인하는 칸을 마쳐 주세요.', en: 'Please finish the human check.' },
    fBusy: { ko: '잠시 뒤에 다시 보내 주세요. 짧은 시간에 너무 많이 보냈습니다.', en: 'Too many ideas in a short time. Try again later.' },
    fFull: { ko: '오늘은 아이디어를 더 받지 않습니다. 내일 다시 보내 주세요.', en: 'We are not taking more ideas today. Please try again tomorrow.' },
    fFail: { ko: '보내지 못했습니다. 잠시 뒤에 다시 시도해 주세요.', en: 'Could not send it. Please try again later.' },
    privacy: {
      ko: '받는 항목: 제목, 설명, 이메일(선택). 이메일은 구현 알림에만 쓰고, 알림을 보내면 지웁니다.',
      en: 'We keep the title, description and, if given, your email. The email is used only for the build notice and deleted once it is sent.',
    },
    drafts: { ko: '시안 목록', en: 'All drafts' },
    themeBtn: { ko: '전시관', en: 'Hall' },
    themeTitle: { ko: '전시관 고르기', en: 'Choose a hall' },
    themeIntro: { ko: '같은 전시품을 네 가지 방식으로 둘러볼 수 있습니다. 고른 전시관은 다음 방문에도 기억합니다.', en: 'The same works, shown four ways. Your choice is remembered for next time.' },
    close: { ko: '닫기', en: 'Close' },
    current: { ko: '지금 보는 곳', en: 'You are here' },
    toDark: { ko: '어둡게 보기', en: 'Dark mode' },
    toLight: { ko: '밝게 보기', en: 'Light mode' },
    footNote: { ko: '바이브 코딩으로 만든 프로젝트를 모아 전시합니다. 새 전시품은 배포될 때마다 자동으로 걸립니다.', en: 'Projects made by vibe coding, hung here automatically each time one ships.' },
    draft: { ko: '시안', en: 'Draft' },
  };

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage may be blocked */ }
  }

  var saved = read('vm.lang');
  var lang = saved === 'ko' || saved === 'en' ? saved : /^ko\b/i.test(navigator.language || '') ? 'ko' : 'en';
  var listeners = [];
  /** The four ways to walk the museum. Each is its own page. */
  var THEMES = [
    { id: 'pinboard', file: 'pinboard.html', name: { ko: '핀보드', en: 'Pinboard' }, desc: { ko: '썸네일을 엇갈려 쌓은 벽. 마우스를 올리면 카드가 뒤집혀 설명이 나옵니다.', en: 'A wall of staggered thumbnails that turn over as you hover.' } },
    { id: 'hall', file: 'hall.html', name: { ko: '3D 전시관', en: 'Gallery Walk' }, desc: { ko: '복도를 걸으며 액자 옆 안내판에서 들어갑니다.', en: 'Walk the corridor and step in from the label beside each work.' } },
    { id: 'catalogue', file: 'catalogue.html', name: { ko: '소장품 카탈로그', en: 'Catalogue' }, desc: { ko: '한 장씩 넘기는 카탈로그. 아래 띠에 모든 페이지가 있습니다.', en: 'A book of plates, with every page in a strip below.' } },
    { id: 'night', file: 'night.html', name: { ko: '야간 개장', en: 'After Hours' }, desc: { ko: '큰 글씨와 큰 그림의 전시실. 손전등으로 둘러볼 수도 있습니다.', en: 'Big type and big pictures, with an optional torch.' } },
  ];
  var mode = read('vm.mode');
  if (mode !== 'dark' && mode !== 'light') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-mode', mode);

  function t(key, params) {
    var entry = STRINGS[key];
    var text = entry ? entry[lang] : key;
    if (params) for (var name in params) text = text.replace('{' + name + '}', params[name]);
    return text;
  }
  /** Display name of an exhibit in the current language. */
  function name(e) {
    return e.title[lang];
  }
  function pick(value) {
    return value && typeof value === 'object' ? value[lang] : value;
  }
  function date(iso) {
    var parts = iso.split('-').map(Number);
    if (lang === 'ko') return parts[0] + '. ' + parts[1] + '. ' + parts[2] + '.';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parts[1] - 1] + ' ' + parts[2] + ', ' + parts[0];
  }
  function days(n) {
    return lang === 'ko' ? n + '일' : n === 1 ? '1 day' : n + ' days';
  }
  /** Live exhibits by last deployment, newest first; then upcoming ones by the date the idea was noted. */
  function exhibits() {
    var all = EXHIBITS;
    var live = all.filter(function (e) { return e.status === 'live'; }).sort(function (a, b) { return b.deployed.localeCompare(a.deployed); });
    var up = all.filter(function (e) { return e.status !== 'live'; }).sort(function (a, b) { return b.noted.localeCompare(a.noted); });
    return live.concat(up);
  }
  function counts() {
    var list = exhibits();
    var live = list.filter(function (e) { return e.status === 'live'; }).length;
    return t('count', { live: live, up: list.length - live });
  }

  function apply() {
    document.documentElement.lang = lang;
    var nodes = document.querySelectorAll('[data-t]');
    for (var i = 0; i < nodes.length; i += 1) nodes[i].textContent = t(nodes[i].getAttribute('data-t'));
    var toggles = document.querySelectorAll('[data-lang-toggle]');
    for (var j = 0; j < toggles.length; j += 1) {
      toggles[j].textContent = lang === 'ko' ? 'EN' : '한국어';
      toggles[j].setAttribute('aria-label', lang === 'ko' ? 'Switch to English' : '한국어로 보기');
    }
    var modes = document.querySelectorAll('[data-mode-toggle]');
    for (var m = 0; m < modes.length; m += 1) {
      modes[m].innerHTML = mode === 'dark' ? SUN : MOON;
      modes[m].setAttribute('aria-label', t(mode === 'dark' ? 'toLight' : 'toDark'));
      modes[m].title = t(mode === 'dark' ? 'toLight' : 'toDark');
    }
    var here = THEMES.filter(function (th) { return th.id === document.body.getAttribute('data-hall'); })[0];
    var names = document.querySelectorAll('[data-theme-name]');
    for (var q = 0; q < names.length; q += 1) names[q].textContent = here ? here.name[lang] : '';
    drawThemes();
    listeners.forEach(function (fn) { fn(lang); });
  }

  function setLang(next) {
    lang = next;
    write('vm.lang', lang);
    apply();
  }

  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/></svg>';
  var CHROME_CSS = [
    ':root{--vmb-bg:#fbfbfa;--vmb-fg:#17181a;--vmb-muted:#6a6c70;--vmb-line:#e2e2de;--vmb-chip:#efefec;--vmb-accent:#2b55a3;--vmb-veil:rgba(15,16,18,.45)}',
    ':root[data-mode="dark"]{--vmb-bg:#141517;--vmb-fg:#ececea;--vmb-muted:#9a9ca1;--vmb-line:#2a2b2f;--vmb-chip:#212226;--vmb-accent:#8fb0ee;--vmb-veil:rgba(0,0,0,.6)}',
    '.vm-bar{position:relative;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(10px + env(safe-area-inset-top,0px)) clamp(16px,3vw,32px) 10px;background:var(--vmb-bg);color:var(--vmb-fg);border-bottom:1px solid var(--vmb-line);font:500 14px/1.4 "IBM Plex Sans KR",system-ui,sans-serif;word-break:keep-all}',
    '.vm-bar a.vm-home{display:flex;align-items:baseline;gap:10px;color:inherit;text-decoration:none;min-width:0}',
    '.vm-bar .vm-logo{font-weight:700;font-size:17px;letter-spacing:-.01em;white-space:nowrap}',
    '.vm-bar .vm-tag{color:var(--vmb-muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.vm-bar .vm-tools{display:flex;align-items:center;gap:8px;flex:0 0 auto}',
    '.vm-bar button{font:500 13px "IBM Plex Sans KR",system-ui,sans-serif;color:var(--vmb-fg);background:var(--vmb-chip);border:1px solid var(--vmb-line);border-radius:999px;height:34px;padding:0 14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
    '.vm-bar button.vm-icon{width:34px;padding:0;justify-content:center}',
    '.vm-bar button:hover{border-color:var(--vmb-fg)}',
    '.vm-bar button:focus-visible,.vm-modal button:focus-visible,.vm-modal a:focus-visible,.vm-foot button:focus-visible{outline:2px solid var(--vmb-accent);outline-offset:2px}',
    '.vm-bar .vm-hall b{font-weight:700}',
    '.vm-foot{background:var(--vmb-bg);color:var(--vmb-muted);border-top:1px solid var(--vmb-line);padding:22px clamp(16px,3vw,32px) calc(22px + env(safe-area-inset-bottom,0px));font:400 13px/1.6 "IBM Plex Sans KR",system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:10px 28px;justify-content:space-between;align-items:center;word-break:keep-all}',
    '.vm-foot b{color:var(--vmb-fg)}',
    '.vm-foot p{margin:0;max-width:60ch}',
    '.vm-foot .vm-links{display:flex;gap:16px;flex-wrap:wrap;align-items:center}',
    '.vm-foot a{color:var(--vmb-fg)}',
    '.vm-foot button{font:inherit;color:var(--vmb-muted);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}',
    '.vm-modal{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:var(--vmb-veil)}',
    '.vm-modal[hidden]{display:none}',
    '.vm-sheet{background:var(--vmb-bg);color:var(--vmb-fg);border:1px solid var(--vmb-line);border-radius:18px;width:min(860px,100%);max-height:calc(100% - 16px);overflow:auto;padding:22px;font:400 14px/1.6 "IBM Plex Sans KR",system-ui,sans-serif;word-break:keep-all;box-shadow:0 30px 60px -20px rgba(0,0,0,.45)}',
    '.vm-sheet .vm-head{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:14px}',
    '.vm-sheet h2{margin:0;font-size:20px}',
    '.vm-sheet .vm-head p{margin:4px 0 0;color:var(--vmb-muted)}',
    '.vm-sheet .vm-head button{font:500 13px "IBM Plex Sans KR",sans-serif;background:var(--vmb-chip);color:var(--vmb-fg);border:1px solid var(--vmb-line);border-radius:999px;height:32px;padding:0 14px;cursor:pointer}',
    '.vm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:14px}',
    '.vm-card{display:grid;gap:8px;text-decoration:none;color:inherit;border:1px solid var(--vmb-line);border-radius:14px;padding:10px;background:var(--vmb-chip)}',
    '.vm-card:hover{border-color:var(--vmb-fg)}',
    '.vm-card[aria-current="page"]{border-color:var(--vmb-accent);box-shadow:0 0 0 1px var(--vmb-accent)}',
    '.vm-card b{font-size:15px}',
    '.vm-card span{color:var(--vmb-muted);font-size:12.5px}',
    '.vm-card em{font-style:normal;color:var(--vmb-accent);font-size:12px;font-weight:700}',
    '.vm-mini{aspect-ratio:16/10;border-radius:9px;overflow:hidden;position:relative}',
    '.vm-mini.pinboard{background:#f3f4f1;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:6px}',
    '.vm-mini.pinboard i{background:#cfd8d1;border-radius:4px}.vm-mini.pinboard i:nth-child(1){grid-row:span 2;background:#0f6e5a}.vm-mini.pinboard i:nth-child(3){grid-row:span 2;background:#f4c95d}.vm-mini.pinboard i:nth-child(4){background:#3d6fb6}',
    '.vm-mini.hall{background:linear-gradient(180deg,#2a2a2c 0 18%,#e7e3dc 18% 72%,#6b4f37 72%)}',
    '.vm-mini.hall i{position:absolute;top:30%;height:30%;background:#2a241d;border:3px solid #2a241d}.vm-mini.hall i:nth-child(1){left:12%;width:34%;background:#7ea37a}.vm-mini.hall i:nth-child(2){left:52%;width:24%;background:#f7f5f0;border-color:#d9d4c8}',
    '.vm-mini.catalogue{background:#34393d;display:grid;grid-template-columns:1fr 1fr;padding:10% 8%}',
    '.vm-mini.catalogue i{background:#f0f1ec}.vm-mini.catalogue i:first-child{background:linear-gradient(#f0f1ec 0 18%,#8aa38a 18% 70%,#f0f1ec 70%)}.vm-mini.catalogue i:last-child{background:repeating-linear-gradient(#f0f1ec 0 7px,#c9cac4 7px 8px);border-left:2px solid #cfd0ca}',
    '.vm-mini.night{background:#0a0b0f}',
    '.vm-mini.night i{position:absolute}.vm-mini.night i:nth-child(1){left:10%;top:14%;width:56%;height:22%;background:#ece6d4;clip-path:polygon(0 0,100% 0,96% 100%,0 100%)}.vm-mini.night i:nth-child(2){left:10%;top:48%;width:44%;height:38%;background:#4d6a52;box-shadow:0 0 0 3px #5b4a25}.vm-mini.night i:nth-child(3){left:60%;top:52%;width:28%;height:6%;background:#d9b45a}',
    '@media (max-width:640px){.vm-bar .vm-tag{display:none}.vm-bar .vm-hall span{display:none}}',
  ].join('\n');

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function drawThemes() {
    var grid = document.getElementById('vm-grid');
    if (!grid) return;
    var hereId = document.body.getAttribute('data-hall');
    grid.innerHTML = THEMES.map(function (th) {
      var cur = th.id === hereId;
      return '<a class="vm-card" href="' + th.file + '"' + (cur ? ' aria-current="page"' : '') + ' data-hall-link="' + th.id + '"><div class="vm-mini ' + th.id + '"><i></i><i></i><i></i><i></i><i></i></div><b>' + th.name[lang] + '</b><span>' + th.desc[lang] + '</span>' + (cur ? '<em>' + t('current') + '</em>' : '') + '</a>';
    }).join('');
  }
  function openThemes(open) {
    var modal = document.getElementById('vm-modal');
    if (!modal) return;
    modal.hidden = !open;
    if (open) { var first = modal.querySelector('[aria-current="page"]') || modal.querySelector('a'); if (first) first.focus(); }
    else { var btn = document.querySelector('[data-theme-toggle]'); if (btn) btn.focus(); }
  }
  /** The header, footer and hall picker every page shares. */
  function chrome() {
    if (document.querySelector('.vm-bar')) return;
    var style = document.createElement('style'); style.textContent = CHROME_CSS; document.head.appendChild(style);
    var font = document.createElement('link'); font.rel = 'stylesheet'; font.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap'; document.head.appendChild(font);
    var hall = document.body.getAttribute('data-hall');
    if (hall) write('vm.hall', hall);
    document.body.insertBefore(el('<header class="vm-bar" id="top"><a class="vm-home" href="#top"><span class="vm-logo" data-t="site"></span><span class="vm-tag" data-t="tagline"></span></a>' +
      '<div class="vm-tools"><button type="button" class="vm-hall" data-theme-toggle aria-haspopup="dialog"><span data-t="themeBtn"></span> <b data-theme-name></b> ▾</button>' +
      '<button type="button" data-lang-toggle></button><button type="button" class="vm-icon" data-mode-toggle></button></div></header>'), document.body.firstChild);
    document.body.appendChild(el('<footer class="vm-foot"><p><b data-t="site"></b> · <span data-t="footNote"></span></p><div class="vm-links"><a href="https://github.com/BranKein" target="_blank" rel="noopener">GitHub</a><span>© 2026</span></div></footer>'));
    document.body.appendChild(el('<div class="vm-modal" id="vm-modal" hidden role="dialog" aria-modal="true" aria-labelledby="vm-modal-h"><div class="vm-sheet"><div class="vm-head"><div><h2 id="vm-modal-h" data-t="themeTitle"></h2><p data-t="themeIntro"></p></div><button type="button" data-theme-close data-t="close"></button></div><div class="vm-grid" id="vm-grid"></div></div></div>'));
    document.getElementById('vm-modal').addEventListener('click', function (ev) { if (ev.target.id === 'vm-modal') openThemes(false); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') openThemes(false); });
  }

  /*
   * Ads (AdSense). Only when config.js has a publisher id and the slot's ad unit id, which the build writes from
   * ADSENSE_* variables; otherwise nothing here runs. The pinboard gets one in-feed card among the exhibit cards,
   * the catalogue and the night hall one box above the footer. The 3D hall and the entrance never get ads.
   */
  var AD_CSS = [
    '.vm-ad{display:block;font:400 11px/1.4 "IBM Plex Sans KR",system-ui,sans-serif}',
    '.vm-ad-label{display:block;margin:0 0 6px;font-size:11px;letter-spacing:.06em;opacity:.62}',
    '.vm-ad ins.adsbygoogle{display:block;min-height:100px}',
    '.vm-ad:has(ins[data-ad-status="unfilled"]){display:none}',
    '.board .vm-ad{margin:0 0 16px;padding:10px 12px 12px;border-radius:16px;background:var(--card,transparent);color:var(--muted,inherit);border:1px dashed var(--line,currentColor);overflow:hidden}',
    '.board .vm-ad ins.adsbygoogle{min-height:250px}',
    '.vm-ad-wrap{position:relative;z-index:6;margin:0 var(--vm-ad-gutter,16px) 40px}',
    '.vm-ad-display{max-width:var(--vm-ad-max,none);margin:0 auto;padding:10px 12px 12px;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,currentColor 3%,transparent)}',
  ].join('');
  // Where the box under the content sits, matching each page's content column.
  var AD_BOX = {
    catalogue: { gutter: 'clamp(16px, 4vw, 48px)', max: '1180px' },
    night: { gutter: 'clamp(16px, 5vw, 72px)', max: 'none' },
  };
  function adSlotId(kind) {
    var slots = CONFIG.adsenseSlots || {};
    return CONFIG.adsenseClient && slots[kind] ? String(slots[kind]) : '';
  }
  function adNode(tag, className, slot) {
    var box = document.createElement(tag);
    box.className = 'vm-ad ' + className;
    box.setAttribute('aria-label', '광고 · Ad');
    var label = document.createElement('span');
    label.className = 'vm-ad-label';
    label.textContent = '광고 · Ad';
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', CONFIG.adsenseClient);
    ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    box.appendChild(label);
    box.appendChild(ins);
    return box;
  }
  /** Asks AdSense to fill each new <ins> once; never one it already filled or was already asked about. */
  function fillAds(root) {
    Array.prototype.forEach.call(root.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status]):not([data-vm-pushed])'), function (ins) {
      ins.setAttribute('data-vm-pushed', '');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked or not ready: the box stays empty */ }
    });
  }
  function ads() {
    if (!CONFIG.adsenseClient) return;
    var hall = document.body.getAttribute('data-hall');
    var made = false;
    var board = hall === 'pinboard' && document.getElementById('board');
    var infeed = adSlotId('infeed');
    if (board && infeed) {
      // The pinboard redraws its cards with innerHTML (filters, language, hover mode), which drops the card.
      // After each redraw a fresh card goes in under the third exhibit (or the last one), in its column, and only it is filled.
      var place = function () {
        if (board.querySelector('.vm-ad')) return;
        var pins = board.querySelectorAll('.pin');
        var card = adNode('aside', 'vm-ad-feed', infeed);
        var after = board.querySelector('.pin[data-i="' + (Math.min(3, pins.length) - 1) + '"]');
        var col = board.querySelector('.col');
        if (after) after.parentNode.insertBefore(card, after.nextSibling);
        else if (col) col.insertBefore(card, col.firstChild);
        else return;
        fillAds(card);
      };
      place();
      new MutationObserver(place).observe(board, { childList: true });
      made = true;
    }
    var display = adSlotId('display');
    var where = AD_BOX[hall];
    var foot = document.querySelector('.vm-foot');
    if (where && display && foot) {
      var wrap = document.createElement('div');
      wrap.className = 'vm-ad-wrap';
      wrap.style.setProperty('--vm-ad-gutter', where.gutter);
      wrap.style.setProperty('--vm-ad-max', where.max);
      wrap.appendChild(adNode('aside', 'vm-ad-display', display));
      foot.parentNode.insertBefore(wrap, foot);
      fillAds(wrap);
      made = true;
    }
    if (!made) return;
    var style = document.createElement('style'); style.textContent = AD_CSS; document.head.appendChild(style);
    // If an ad blocker stopped the AdSense script, take the empty boxes away again.
    window.addEventListener('load', function () {
      setTimeout(function () {
        if (window.adsbygoogle && window.adsbygoogle.loaded) return;
        Array.prototype.forEach.call(document.querySelectorAll('.vm-ad'), function (box) { box.style.display = 'none'; });
        var css = document.createElement('style'); css.textContent = '.vm-ad{display:none!important}'; document.head.appendChild(css);
      }, 4000);
    });
  }

  var turnstileLoading = null;
  function loadTurnstile() {
    if (!turnstileLoading) {
      turnstileLoading = new Promise(function (resolve, reject) {
        var tag = document.createElement('script');
        tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        tag.async = true;
        tag.onload = function () { resolve(window.turnstile); };
        tag.onerror = reject;
        document.head.appendChild(tag);
      });
    }
    return turnstileLoading;
  }

  /**
   * Fills a form that has #f-title, #f-desc, #f-email and a [data-form-status] element.
   * With an idea API in config.js it sends the idea (through Turnstile when a site key is set); otherwise it
   * only checks the fields and says the box is not open yet.
   */
  function wireForm(form) {
    var status = form.querySelector('[data-form-status]');
    var send = form.querySelector('[type="submit"]');
    var widget = null;
    if (CONFIG.ideasApi && CONFIG.turnstileSiteKey) {
      var box = document.createElement('div');
      box.className = 'vm-turnstile';
      box.style.minHeight = '65px';
      form.insertBefore(box, send);
      loadTurnstile().then(function (ts) {
        widget = ts.render(box, { sitekey: CONFIG.turnstileSiteKey, language: lang, theme: mode === 'dark' ? 'dark' : 'light' });
      }).catch(function () { /* the server says so if the token is missing */ });
    }
    function say(key, ok) {
      status.textContent = t(key);
      status.setAttribute('data-kind', ok ? 'ok' : 'error');
      status.hidden = false;
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var title = form.querySelector('#f-title').value.trim();
      var desc = form.querySelector('#f-desc').value.trim();
      var email = form.querySelector('#f-email').value.trim();
      if (!title || !desc) return say('fNeed', false);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('fBadEmail', false);
      if (!CONFIG.ideasApi) return say('fSent', true);
      var token = widget !== null && window.turnstile ? window.turnstile.getResponse(widget) : '';
      if (CONFIG.turnstileSiteKey && !token) return say('fRobot', false);
      say('fSending', true);
      if (send) send.disabled = true;
      fetch(CONFIG.ideasApi + '/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, description: desc, email: email, turnstileToken: token, lang: lang }),
      }).then(function (res) {
        if (res.ok) {
          form.reset();
          say(email ? 'fThanksMail' : 'fThanks', true);
          return;
        }
        return res.json().catch(function () { return {}; }).then(function (body) {
          say(res.status === 429 ? (body.error === 'daily' ? 'fFull' : 'fBusy') : res.status === 403 ? 'fRobot' : 'fFail', false);
        });
      }).catch(function () {
        say('fFail', false);
      }).then(function () {
        if (send) send.disabled = false;
        if (widget !== null && window.turnstile) window.turnstile.reset(widget);
      });
    });
  }

  document.addEventListener('click', function (event) {
    var toggle = event.target.closest && event.target.closest('[data-lang-toggle]');
    if (toggle) setLang(lang === 'ko' ? 'en' : 'ko');
    var mt = event.target.closest && event.target.closest('[data-mode-toggle]');
    if (mt) { mode = mode === 'dark' ? 'light' : 'dark'; write('vm.mode', mode); document.documentElement.setAttribute('data-mode', mode); apply(); }
    if (event.target.closest && event.target.closest('[data-theme-toggle]')) openThemes(true);
    if (event.target.closest && event.target.closest('[data-theme-close]')) openThemes(false);
  });

  window.VM = {
    t: t,
    pick: pick,
    name: name,
    date: date,
    days: days,
    exhibits: exhibits,
    counts: counts,
    get lang() { return lang; },
    onLang: function (fn) { listeners.push(fn); },
    get mode() { return mode; },
    themes: THEMES,
    savedHall: function () { return read('vm.hall'); },
    start: function () { chrome(); apply(); ads(); },
    wireForm: wireForm,
  };
})();
