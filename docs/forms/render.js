// Form runtime: renders a published form document into a container and runs the whole
// respondent flow (intro, screens, validation, autosave on-device, submit, thank-you).
// Builds DOM with textContent only (never innerHTML), so respondent or admin text can't inject markup.
// Also used by the admin for live preview (opts.preview = true: no network, no storage).

import { checkAnswer, isQuestion, isScale, scaleOf, visiblePages, isShown, pipe, TYPES } from './core.js';
import { solve } from './pow.js';

export const CRISIS_DEFAULT = 'CalmCampus supports wellbeing and is not a medical service. If you need help right now, please contact your university’s student support or local emergency services. In Belgium you can call 112 in an emergency, Tele-Onthaal on 106 or the Zelfmoordlijn on 1813, any time.';
export const CONTACT_DEFAULT = 'contact@calm.braunf.com';
const FACES = [
  'M9 16 Q12 12.5 15 16', 'M9 15.5 Q12 13.5 15 15.5', 'M9 15 H15', 'M9 14 Q12 17 15 14', 'M8.5 13.5 Q12 19 15.5 13.5',
];
const WEEK = ['Rough', 'Heavy', 'Okay', 'Good', 'Great'];
const MOOD = ['Drained', 'Low', 'Steady', 'Good', 'Energised'];
const ASSET = /^assets\/[\w./-]+\.(png|jpe?g|svg|webp)$/;

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const svg = (inner, vb = '0 0 24 24', cls = '') => { const w = document.createElement('div'); w.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="${cls}" aria-hidden="true" focusable="false">${inner}</svg>`; return w.firstChild; }; // static strings only

// ── The privacy notice every form shows before the first question ───────────────────────
export function noticeFor(form) {
  const s = form.settings || {}, anon = form.privacy_mode !== 'identified';
  const contact = s.contact_email || CONTACT_DEFAULT;
  const rows = anon ? [
    ['What we collect', 'Your answers, and the week you sent them (not the date or time). Nothing else.'],
    ['What we don’t', 'No name, email, IP address, device details, cookies or account. Your answers are not linked to anything that identifies you, so we can’t tell who sent them.'],
    ['Where it goes', 'The CalmCampus app keeps your data on your phone. A survey is different: to read the results, your answers are sent to and stored on a server in the EU. The network provider that delivers your request can see your IP address while it does, but we don’t keep it.'],
    ['Who sees it', s.who || 'The CalmCampus team (students at UCLL, Belgium). We only look at results in summary, and we show no group smaller than 5 people.'],
    ['How long', s.retention_text || 'Until this study ends. Because we can’t tell which answers are yours, we can’t delete them once sent. You can stop at any point before sending and nothing is submitted.'],
    ['On your device', 'While you fill this in, your answers are saved on this device only so you can pick up later. They’re cleared when you send.'],
  ] : [
    ['What we collect', 'Your answers and the contact details you enter (' + (s.contact_fields || 'name and email') + ').'],
    ['Why', s.purpose || 'So the CalmCampus team can follow up with you about this.'],
    ['Where it goes', 'Stored on a server in the EU. Unlike the app, which keeps its data on your phone, this form has to send it to us.'],
    ['Who sees it', s.who || 'The CalmCampus team.'],
    ['How long', `We keep it for ${s.retention_days || 90} days, then delete it automatically.`],
    ['Your rights', `You’ll get a deletion code when you send. Use it at any time to delete your answers (cc.braunf.com/f/), or email ${contact}. You can also ask us what we hold about you.`],
  ];
  return {
    promise: anon ? 'No account, no email, no tracking. We can’t tell who you are.' : 'This one isn’t anonymous: we’ll know who you are, and you choose what to share.',
    rows, contact,
    warn: anon ? 'Please don’t put names or details that could identify you or other people in your answers.' : null,
  };
}

export function notice(form) {
  const n = noticeFor(form);
  return h('section', { class: 'cc-notice', 'aria-labelledby': 'cc-promise' },
    h('strong', { class: 'cc-promise', id: 'cc-promise', text: n.promise }),
    n.warn && h('p', { class: 'cc-warn', text: n.warn }),
    h('details', {}, h('summary', { text: 'What’s collected, and what isn’t' }),
      h('dl', {}, n.rows.flatMap(([t, d]) => [h('dt', { text: t }), h('dd', { text: d })])),
      h('p', { class: 'cc-warn mt' }, 'Questions? ', h('a', { href: 'mailto:' + n.contact, text: n.contact }), '.')));
}

// ── Question widgets ──────────────────────────────────────────────────────────────────
function field(b, ctx, body, { group = false, labelFor } = {}) {
  const { answers, doc } = ctx;
  const text = () => pipe(b.label, doc, answers);
  const errId = `err-${b.id}`, helpId = `help-${b.id}`;
  const label = h(group ? 'legend' : 'label', { class: group ? '' : 'cc-label', for: group ? false : labelFor, id: `lbl-${b.id}` },
    text(), !b.required && h('span', { class: 'opt', text: 'optional' }));
  const wrap = h(group ? 'fieldset' : 'div', { class: 'cc-q', 'data-id': b.id, 'aria-describedby': [b.help && helpId, errId].filter(Boolean).join(' ') },
    label, b.help && h('p', { class: 'cc-help', id: helpId, text: pipe(b.help, doc, answers) }), body,
    h('div', { id: errId, role: 'alert' }));
  return wrap;
}

const optLabel = (b, o) => o.label;

function widget(b, ctx) {
  const { answers, set } = ctx;
  const val = answers[b.id];
  const id = `in-${b.id}`;
  switch (b.type) {
    case 'short_text': case 'email': case 'number': case 'date': {
      const type = { short_text: 'text', email: 'email', number: 'number', date: 'date' }[b.type];
      const input = h('input', { type: type === 'number' ? 'number' : type, id, name: b.id, value: val ?? '', maxlength: b.type === 'short_text' ? (b.maxLength || 200) : false,
        inputmode: b.type === 'number' ? 'decimal' : false, autocomplete: b.type === 'email' ? 'email' : 'off', min: Number.isFinite(b.min) ? b.min : false, max: Number.isFinite(b.max) ? b.max : false,
        step: b.type === 'number' ? 'any' : false, onInput: (e) => set(b.id, e.target.value) });
      return field(b, ctx, input, { labelFor: id });
    }
    case 'long_text': {
      const max = b.maxLength || 2000;
      const count = h('div', { class: 'cc-count', 'aria-hidden': 'true', text: `${(val || '').length} / ${max}` });
      const ta = h('textarea', { id, name: b.id, maxlength: max, rows: 5, onInput: (e) => { set(b.id, e.target.value); count.textContent = `${e.target.value.length} / ${max}`; } });
      ta.value = val ?? '';
      return field(b, ctx, [ta, count], { labelFor: id });
    }
    case 'dropdown': {
      const sel = h('select', { id, name: b.id, onChange: (e) => set(b.id, e.target.value || undefined) },
        h('option', { value: '', text: 'Choose…' }), b.options.map((o) => h('option', { value: o.id, text: o.label })), b.other && h('option', { value: 'other', text: 'Other' }));
      sel.value = val ?? '';
      const other = otherInput(b, ctx, () => answers[b.id] === 'other');
      sel.addEventListener('change', other.refresh);
      return field(b, ctx, [sel, other.el], { labelFor: id });
    }
    case 'single_choice': case 'multi_choice': {
      const multi = b.type === 'multi_choice';
      const other = otherInput(b, ctx, () => (multi ? (answers[b.id] || []).includes('other') : answers[b.id] === 'other'));
      const opts = [...b.options, ...(b.other ? [{ id: 'other', label: 'Other' }] : [])];
      const list = h('div', { class: 'cc-choices' }, opts.map((o) => {
        const input = h('input', { type: multi ? 'checkbox' : 'radio', name: b.id, value: o.id,
          checked: multi ? (val || []).includes(o.id) : val === o.id,
          onChange: () => {
            if (multi) { const cur = new Set(answers[b.id] || []); input.checked ? cur.add(o.id) : cur.delete(o.id); set(b.id, [...cur]); }
            else set(b.id, o.id);
            other.refresh();
          } });
        return h('label', { class: 'cc-choice' + (multi ? ' check' : '') }, input, h('span', { class: 'box', text: optLabel(b, o) }));
      }));
      list.setAttribute('role', multi ? 'group' : 'radiogroup');
      return field(b, ctx, [list, other.el], { group: true });
    }
    case 'yes_no': {
      const pills = h('div', { class: 'cc-pills' }, [['yes', 'Yes'], ['no', 'No']].map(([k, t]) =>
        h('label', { class: 'cc-choice' }, h('input', { type: 'radio', name: b.id, value: k, checked: val === k, onChange: () => set(b.id, k) }), h('span', { class: 'box', text: t }))));
      return field(b, ctx, pills, { group: true });
    }
    case 'rating': {
      const { min, max } = scaleOf(b);
      const stars = h('div', { class: 'cc-stars' });
      const paint = () => stars.querySelectorAll('.cc-choice').forEach((el, i) => el.classList.toggle('on', i + min <= (answers[b.id] || 0)));
      for (let n = min; n <= max; n++) {
        const input = h('input', { type: 'radio', name: b.id, value: n, checked: val === n, 'aria-label': `${n} of ${max}`, onChange: () => { set(b.id, n); paint(); } });
        stars.append(h('label', { class: 'cc-choice' }, input, h('span', { class: 'box' }, svg('<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" stroke-linejoin="round"/>'))));
      }
      queueMicrotask(paint);
      return field(b, ctx, [stars, ends(b)], { group: true });
    }
    case 'scale': case 'illustrated_scale': case 'week_scale': {
      const { min, max } = scaleOf(b);
      const faces = b.type === 'illustrated_scale', week = b.type === 'week_scale';
      const row = h('div', { class: 'cc-scale' + (faces ? ' faces' : '') + (week ? ' week' : ''), role: 'radiogroup' });
      for (let n = min; n <= max; n++) {
        const i = Math.round(((n - min) / (max - min)) * 4);
        const face = faces && svg(`<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="9.5" r="1" fill="currentColor"/><circle cx="15" cy="9.5" r="1" fill="currentColor"/><path d="${FACES[i]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
        const word = week ? WEEK[i] : faces ? (n === min ? (b.minLabel || '') : n === max ? (b.maxLabel || '') : '') : String(n);
        row.append(h('label', { class: 'cc-choice' }, h('input', { type: 'radio', name: b.id, value: n, checked: val === n, 'aria-label': week ? WEEK[i] : `${n} of ${max}${faces ? ': ' + MOOD[i] : ''}`, onChange: () => set(b.id, n) }),
          h('span', { class: 'box' }, face, word)));
      }
      return field(b, ctx, [row, !week && ends(b)], { group: true });
    }
    case 'mood_slider': {
      const { min, max } = scaleOf(b);
      const out = h('output', { for: id, 'aria-live': 'polite', text: val ? MOOD[Math.round(((val - min) / (max - min)) * 4)] : 'Slide to answer' });
      const box = h('div', { class: 'cc-mood' + (val ? ' touched' : '') });
      const input = h('input', { type: 'range', id, min, max, step: 1, value: val ?? Math.round((min + max) / 2), 'aria-labelledby': `lbl-${b.id}`,
        'aria-valuetext': val ? MOOD[Math.round(((val - min) / (max - min)) * 4)] : 'not answered yet' });
      const upd = () => { const n = +input.value; set(b.id, n); box.classList.add('touched'); out.textContent = MOOD[Math.round(((n - min) / (max - min)) * 4)]; input.setAttribute('aria-valuetext', out.textContent); };
      input.addEventListener('input', upd); input.addEventListener('change', upd);
      box.append(out, input, ends({ minLabel: b.minLabel || 'Drained', maxLabel: b.maxLabel || 'Energised' }));
      return field(b, ctx, box, {});
    }
    case 'ranking': {
      let order = Array.isArray(val) ? [...val] : b.options.map((o) => o.id);
      const ol = h('ol', { class: 'cc-rank' });
      const live = h('div', { class: 'sr', 'aria-live': 'polite' });
      const draw = () => {
        ol.replaceChildren(...order.map((oid, i) => {
          const o = b.options.find((x) => x.id === oid);
          const move = (d) => () => { const j = i + d; [order[i], order[j]] = [order[j], order[i]]; set(b.id, [...order]); draw(); live.textContent = `${o.label} moved to position ${j + 1}`; ol.children[j].querySelector(d < 0 ? '.up' : '.down').focus(); };
          return h('li', {}, h('span', { text: o.label }),
            h('button', { type: 'button', class: 'up', 'aria-label': `Move ${o.label} up`, disabled: i === 0, onClick: move(-1), text: '↑' }),
            h('button', { type: 'button', class: 'down', 'aria-label': `Move ${o.label} down`, disabled: i === order.length - 1, onClick: move(1), text: '↓' }));
        }));
      };
      draw();
      const keep = h('button', { type: 'button', class: 'cc-btn link', onClick: () => { set(b.id, [...order]); live.textContent = 'Order saved'; keep.textContent = 'Order saved ✓'; }, text: 'This order is right' });
      return field(b, ctx, [h('p', { class: 'cc-help', text: 'Put the most important first.' }), ol, keep, live], { group: true });
    }
    case 'info_text': return h('div', { class: 'cc-info', 'data-id': b.id }, (b.text || b.label || '').split(/\n{2,}/).map((p) => h('p', { text: pipe(p, ctx.doc, answers) })));
    case 'info_image': return ASSET.test(b.src || '') ? h('figure', { class: 'cc-img', 'data-id': b.id }, h('img', { src: b.src, alt: b.alt || '', loading: 'lazy' })) : h('span', { 'data-id': b.id });
    case 'divider': return h('hr', { class: 'cc-divider', 'data-id': b.id });
    default: return h('span', { 'data-id': b.id });
  }
}

const ends = (b) => (b.minLabel || b.maxLabel) ? h('div', { class: 'cc-ends', 'aria-hidden': 'true' }, h('span', { text: b.minLabel || '' }), h('span', { text: b.maxLabel || '' })) : null;

function otherInput(b, ctx, active) {
  if (!b.other) return { el: null, refresh() {} };
  const input = h('input', { type: 'text', class: 'cc-other-in', maxlength: 300, 'aria-label': `Other: please say what`, placeholder: 'Please say what', value: ctx.answers[`${b.id}.other`] ?? '', onInput: (e) => ctx.set(`${b.id}.other`, e.target.value) });
  const el = h('div', { class: 'cc-other' }, input);
  const refresh = () => { el.hidden = !active(); };
  refresh();
  return { el, refresh };
}

// ── Screens ──────────────────────────────────────────────────────────────────────────
function buildScreens(doc, view) {
  const screens = [];
  for (const page of doc.pages) {
    if (view !== 'steps') { screens.push({ pageId: page.id, title: page.title, blocks: page.blocks }); continue; }
    let group = [];
    for (const b of page.blocks) { group.push(b); if (isQuestion(b)) { screens.push({ pageId: page.id, title: page.title, blocks: group }); group = []; } }
    if (group.length) { if (screens.length && screens[screens.length - 1].pageId === page.id) screens[screens.length - 1].blocks.push(...group); else screens.push({ pageId: page.id, title: page.title, blocks: group }); }
  }
  return screens;
}

export function mountForm(root, form, opts = {}) {
  const { preview = false, api, assetBase = '/' } = opts;
  const doc = form.doc, s = form.settings || {};
  const identified = form.privacy_mode === 'identified';
  const view = s.view === 'steps' ? 'steps' : 'pages';
  const key = `cc-form:${form.slug}:v${form.version}`, doneKey = `cc-form-done:${form.slug}`;
  const store = {
    get(k) { if (preview) return null; try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { if (preview) return; try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
    del(k) { if (preview) return; try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  let answers = {}, idx = -1, contact = { name: '', email: '' }, consent = false, errors = {}, powP = null, reached = new Set();
  try { const saved = JSON.parse(store.get(key) || 'null'); if (saved?.answers) { answers = saved.answers; idx = Math.min(saved.idx ?? -1, 999); } } catch { /* ignore */ }
  let resumed = Object.keys(answers).length > 0;

  const persist = () => store.set(key, JSON.stringify({ answers, idx }));
  const ctx = { doc, answers, set(k, v) { if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete answers[k]; else answers[k] = v; persist(); syncVisibility(); } };

  root.classList.add('cc-form');
  const live = h('div', { class: 'sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const stage = h('div');
  const progressBar = h('div');
  const progressWrap = h('div', { hidden: true }, h('div', { class: 'cc-progress', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': 0, 'aria-valuemax': 100 }, progressBar), h('p', { class: 'cc-stepnote' }));
  if (s.cover === 'sage' || s.cover === 'terracotta') root.append(h('div', { class: 'cc-cover', 'data-cover': s.cover, 'aria-hidden': 'true' }, h('i'), h('i')));
  root.append(h('div', { class: 'cc-top' }, h('picture', {}, h('source', { media: '(prefers-color-scheme: dark)', srcset: assetBase + 'assets/brand/first-sprout-horizontal-reversed.svg' }),
    h('img', { src: assetBase + 'assets/brand/first-sprout-horizontal-color.svg', alt: 'CalmCampus', width: 222, height: 34 }))), progressWrap, stage, live);

  const visibleIds = () => new Set(visiblePages(doc, answers).flatMap((p) => p.blocks.map((b) => b.id)));
  const activeScreens = () => { const v = visibleIds(); return buildScreens(doc, view).filter((sc) => sc.blocks.some((b) => v.has(b.id))); };
  let current = null; // {screen, nodes}

  function syncVisibility() {
    if (!current) return;
    const v = visibleIds();
    const hasQ = current.screen.blocks.some((b) => isQuestion(b));
    for (const b of current.screen.blocks) {
      const node = current.nodes.get(b.id);
      const shown = view === 'steps' && hasQ ? current.screen.blocks.some((x) => isQuestion(x) && v.has(x.id)) : v.has(b.id);
      if (node) node.hidden = !shown;
    }
    // question text may pipe earlier answers within the same screen
    for (const b of current.screen.blocks) if (isQuestion(b) && current.nodes.get(b.id)) {
      const l = current.nodes.get(b.id).querySelector('legend, label.cc-label');
      if (l && b.label.includes('{{')) l.firstChild.textContent = pipe(b.label, doc, answers);
    }
  }

  function setProgress(i, n) {
    const pct = Math.round((i / Math.max(n, 1)) * 100);
    progressBar.style.width = pct + '%';
    progressWrap.firstChild.setAttribute('aria-valuenow', pct);
    progressWrap.lastChild.textContent = `Step ${Math.min(i + 1, n)} of ${n}`;
  }

  function show(node, announce) {
    stage.replaceChildren(node);
    node.setAttribute('tabindex', '-1');
    window.scrollTo({ top: 0 });
    node.focus({ preventScroll: true });
    if (announce) live.textContent = announce;
  }

  function beacon(pageId) {
    if (preview || !api || reached.has(pageId)) return;
    reached.add(pageId); api.reach(pageId).catch(() => {});
  }

  // ── intro
  function renderIntro() {
    progressWrap.hidden = true;
    const done = store.get(doneKey);
    const start = () => {
      if (!preview && api && !powP) powP = startChallenge();
      idx = 0; persist(); renderScreen();
    };
    const node = h('section', { class: 'cc-screen', 'aria-labelledby': 'cc-title' },
      h('h1', { id: 'cc-title', text: form.title }),
      s.intro && h('p', { class: 'cc-lead', text: s.intro }),
      notice(form),
      s.one_per_device && done && h('p', { class: 'cc-warn', text: 'It looks like you’ve already answered on this device, thank you! (This is only a note on your device. Nothing was sent anywhere.) You’re welcome to answer again.' }),
      resumed && h('p', { class: 'cc-warn', text: 'We kept your earlier answers on this device, so you can carry on where you left off.' }),
      h('div', { class: 'cc-nav' }, h('button', { type: 'button', class: 'cc-btn', onClick: () => { if (resumed && idx > 0) { if (!preview && api && !powP) powP = startChallenge(); renderScreen(); } else start(); }, text: resumed ? 'Continue' : 'Start' }),
        resumed && h('button', { type: 'button', class: 'cc-btn link', onClick: () => { Object.keys(answers).forEach((k) => delete answers[k]); idx = -1; resumed = false; store.del(key); renderIntro(); }, text: 'Start over' })),
    );
    show(node);
  }

  // ── a screen of questions
  function renderScreen() {
    const screens = activeScreens();
    if (idx >= screens.length) return identified ? renderContact(screens.length) : submit();
    idx = Math.max(0, idx);
    const screen = screens[idx];
    const nodes = new Map();
    const body = h('form', { novalidate: true, onSubmit: (e) => { e.preventDefault(); next(); } });
    for (const b of screen.blocks) { const n = widget(b, ctx); nodes.set(b.id, n); body.append(n); }
    body.append(h('input', { class: 'cc-hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }));
    current = { screen, nodes };
    const last = idx === screens.length - 1 && !identified;
    const node = h('section', { class: 'cc-screen', 'aria-label': screen.title || `Step ${idx + 1}` },
      screen.title && view !== 'steps' && h('h2', { text: pipe(screen.title, doc, answers) }), body,
      h('div', { class: 'cc-nav' },
        idx > 0 && h('button', { type: 'button', class: 'cc-btn ghost', onClick: back, text: 'Back' }),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'cc-btn', onClick: next, text: last ? 'Send' : 'Next' })));
    progressWrap.hidden = false; setProgress(idx, screens.length + (identified ? 1 : 0));
    show(node, `Step ${idx + 1} of ${screens.length}`);
    syncVisibility();
    beacon(screen.pageId);
    for (const [id, e] of Object.entries(errors)) showError(id, e);
  }

  function showError(id, msg) {
    const wrap = current?.nodes.get(id); if (!wrap) return;
    wrap.classList.add('has-error');
    const box = wrap.querySelector(`#err-${id}`); box.replaceChildren(h('p', { class: 'cc-err', text: msg }));
    wrap.querySelectorAll('input,select,textarea').forEach((i) => i.setAttribute('aria-invalid', 'true'));
  }

  function validateScreen() {
    errors = {}; const v = visibleIds();
    for (const b of current.screen.blocks) {
      if (!isQuestion(b) || !v.has(b.id)) continue;
      const r = checkAnswer(b, answers[b.id], answers); if (r.error) errors[b.id] = r.error;
    }
    return Object.keys(errors).length === 0;
  }
  function next() {
    if (!validateScreen()) {
      for (const [id, e] of Object.entries(errors)) showError(id, e);
      const first = current.nodes.get(Object.keys(errors)[0]);
      first.scrollIntoView({ block: 'center' }); (first.querySelector('input,select,textarea') || first).focus();
      live.textContent = 'Please check your answers.'; return;
    }
    idx++; persist(); renderScreen();
  }
  function back() { errors = {}; idx = Math.max(0, idx - 1); persist(); renderScreen(); }

  // ── identified: contact + consent
  function renderContact(n) {
    const days = s.retention_days || 90;
    const err = h('div', { role: 'alert' });
    const name = h('input', { type: 'text', id: 'c-name', autocomplete: 'name', value: contact.name, onInput: (e) => { contact.name = e.target.value; } });
    const mail = h('input', { type: 'email', id: 'c-mail', autocomplete: 'email', value: contact.email, onInput: (e) => { contact.email = e.target.value; } });
    const cb = h('input', { type: 'checkbox', id: 'c-consent', checked: consent, onChange: (e) => { consent = e.target.checked; } });
    const node = h('section', { class: 'cc-screen', 'aria-label': 'Your details' },
      h('h2', { text: 'Your details' }),
      h('p', { class: 'cc-lead', text: 'Only what we need to get back to you.' }),
      h('div', { class: 'cc-q' }, h('label', { class: 'cc-label', for: 'c-name' }, 'Name', h('span', { class: 'opt', text: 'optional' })), name),
      h('div', { class: 'cc-q' }, h('label', { class: 'cc-label', for: 'c-mail', text: 'Email' }), mail),
      h('div', { class: 'cc-q' }, h('label', { class: 'cc-choice check' }, cb, h('span', { class: 'box', text: s.consent || `I agree that CalmCampus stores my answers and contact details for ${days} days for the purpose described above, and then deletes them.` }))),
      err,
      h('div', { class: 'cc-nav' }, h('button', { type: 'button', class: 'cc-btn ghost', onClick: () => { idx = n - 1; renderScreen(); }, text: 'Back' }), h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'cc-btn', text: 'Send', onClick: () => {
          const bad = !checkAnswer({ type: 'email', required: true }, contact.email).value ? 'Please enter a valid email address.' : !consent ? 'Please tick the box to agree, or go back and leave without sending.' : '';
          if (bad) { err.replaceChildren(h('p', { class: 'cc-err', text: bad })); return; }
          submit();
        } })));
    current = null; show(node, 'Your details'); setProgress(n, n + 1);
  }

  // ── submit
  function startChallenge() {
    return api.challenge().then(async (c) => ({ token: c.token, pow: await solve(c.token, c.bits), at: Date.now() })).catch(() => null);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function submit() {
    progressWrap.hidden = true; current = null;
    const sending = h('section', { class: 'cc-screen', 'aria-live': 'polite' }, h('h2', { text: 'Sending…' }), h('p', { class: 'cc-lead', text: 'One moment.' }));
    show(sending);
    if (preview) return done({ preview: true });
    try {
      let p = (await powP) || null;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!p || Date.now() - p.at > 25 * 60 * 1000 || attempt > 0) { powP = startChallenge(); p = await powP; if (attempt > 0) await sleep(4300); }
        if (!p) throw new Error('offline');
        const res = await api.submit({ answers, token: p.token, pow: p.pow, ...(identified ? { contact, consent } : {}) });
        if (res.ok) { store.del(key); store.set(doneKey, '1'); return done(res); }
        if (res.error === 'challenge' && attempt === 0) continue;
        if (res.error === 'closed') return closed();
        if (res.errors) { errors = res.errors; const sc = activeScreens(); idx = Math.max(0, sc.findIndex((x) => x.blocks.some((b) => res.errors[b.id]))); return renderScreen(); }
        if (res.status === 429) throw new Error('busy');
        throw new Error('failed');
      }
    } catch (e) {
      const node = h('section', { class: 'cc-screen' }, h('h2', { text: e.message === 'busy' ? 'A lot of people at once' : 'That didn’t go through' }),
        h('p', { class: 'cc-lead', text: e.message === 'busy' ? 'Please wait a minute and try again. Your answers are still saved on this device.' : 'Your answers are still saved on this device. Check your connection and try again.' }),
        h('div', { class: 'cc-nav' }, h('button', { type: 'button', class: 'cc-btn', onClick: () => { idx = activeScreens().length - 1; renderScreen(); }, text: 'Go back' }), h('button', { type: 'button', class: 'cc-btn ghost', onClick: submit, text: 'Try again' })));
      show(node);
    }
  }

  function closed() {
    show(h('section', { class: 'cc-screen' }, h('h1', { text: 'This form is closed' }), h('p', { class: 'cc-lead', text: 'It isn’t taking answers any more. Thank you for stopping by.' })));
  }

  function done(res) {
    const crisis = s.crisis === false || s.wellbeing === false ? null : (s.crisis || CRISIS_DEFAULT);
    const redirect = typeof s.redirect === 'string' && /^https:\/\/[^\s]+$/.test(s.redirect) ? s.redirect : null;
    let follow = null;
    if (!identified && s.follow_up && s.follow_up.enabled && api) follow = followUpBox(s.follow_up);
    const node = h('section', { class: 'cc-screen', 'aria-labelledby': 'cc-done' },
      h('h1', { id: 'cc-done', text: 'All done' }),
      h('p', { class: 'cc-lead', text: s.thanks || 'That helps more than you might think. Take a breath, you’re done.' }),
      res.preview && h('p', { class: 'cc-warn', text: 'Preview only: nothing was sent.' }),
      res.deleteToken && h('div', {}, h('p', { text: 'Your deletion code. Keep it somewhere safe: it’s the only way to delete your answers yourself.' }), h('div', { class: 'cc-token', text: res.deleteToken }),
        h('p', { class: 'cc-warn' }, 'To delete later, go to ', h('a', { href: '/f/', text: 'cc.braunf.com/f/' }), ' and paste it in.')),
      follow, crisis && h('p', { class: 'cc-crisis', text: crisis }),
      redirect && h('p', {}, h('a', { href: redirect, rel: 'noopener', text: 'Continue →' })),
      h('p', { class: 'cc-foot' }, h('a', { href: assetBase + 'index.html', text: 'About CalmCampus' })));
    progressWrap.hidden = true; show(node, 'All done. Thank you.');
    if (redirect && !preview) setTimeout(() => location.assign(redirect), 6000);
  }

  function followUpBox(cfg) {
    const t0 = Date.now();
    let p = api.challenge().then(async (c) => ({ token: c.token, pow: await solve(c.token, c.bits) })).catch(() => null);
    const input = h('input', { type: 'email', id: 'fu-mail', autocomplete: 'email', 'aria-label': 'Email address', placeholder: 'you@university.be' });
    const msg = h('div', { role: 'status' });
    const btn = h('button', { type: 'button', class: 'cc-btn ghost', text: cfg.button || 'Keep me posted', onClick: async () => {
      if (!checkAnswer({ type: 'email', required: true }, input.value).value) { msg.replaceChildren(h('p', { class: 'cc-err', text: 'Please enter a valid email address.' })); return; }
      btn.disabled = true;
      try {
        let tok = await p; if (!tok) throw new Error();
        await sleep(Math.max(0, 4300 - (Date.now() - t0))); // the challenge must be a few seconds old
        let r = await api.followUp({ contact: input.value.trim(), ...tok });
        if (!r.ok) throw new Error();
        box.replaceChildren(h('p', { text: 'Thank you. We’ve saved your email, separately from your answers.' }));
      } catch { btn.disabled = false; msg.replaceChildren(h('p', { class: 'cc-err', text: 'That didn’t go through. Please try again in a moment.' })); }
    } });
    const box = h('section', { class: 'cc-follow', 'aria-labelledby': 'fu-h' },
      h('h2', { id: 'fu-h', text: cfg.title || 'Want to hear what we find?' }),
      h('p', { text: cfg.text || 'Leave your email if you’d like to hear about the results or the pilot. Optional.' }),
      h('p', { class: 'cc-warn', text: 'This is sent separately from your answers. It’s stored in a different place, with only the week, and nothing links the two. We can’t connect your email to anything you said.' }),
      h('div', { class: 'row' }, input, btn), msg);
    return box;
  }

  // Admin preview can start anywhere: 'intro', 'done', or a block id.
  if (opts.startAt === 'done') done({ preview: true });
  else if (opts.startAt && opts.startAt !== 'intro') {
    const i = activeScreens().findIndex((x) => x.blocks.some((b) => b.id === opts.startAt));
    idx = Math.max(0, i); renderScreen();
  } else renderIntro();
  return { destroy() { root.replaceChildren(); } };
}

// Delete page for identified forms: paste your code, your answers go.
export function mountDelete(root, api, assetBase = '') {
  root.classList.add('cc-form');
  const input = h('input', { type: 'text', id: 'dc', autocomplete: 'off', spellcheck: 'false' });
  const msg = h('div', { role: 'status' });
  root.append(h('div', { class: 'cc-top' }, h('img', { src: assetBase + 'assets/brand/first-sprout-horizontal-color.svg', alt: 'CalmCampus', width: 222, height: 34 })),
    h('section', { class: 'cc-screen' }, h('h1', { text: 'Delete my answers' }),
      h('p', { class: 'cc-lead', text: 'Paste the deletion code you were given when you sent an identified form. Anonymous answers can’t be deleted, because nobody can tell which are yours.' }),
      h('div', { class: 'cc-q' }, h('label', { class: 'cc-label', for: 'dc', text: 'Deletion code' }), input),
      h('div', { class: 'cc-nav' }, h('button', { type: 'button', class: 'cc-btn', text: 'Delete', onClick: async () => {
        const r = await api.deleteWithToken(input.value.trim()).catch(() => ({ ok: false }));
        msg.replaceChildren(h('p', { class: r.ok ? 'cc-help' : 'cc-err', text: r.ok ? 'Done. Your answers and contact details have been deleted.' : 'We couldn’t find that code. It may already have been used, or expired.' }));
      } })), msg));
}
