// The form editor: block outline, inspector (with show-if logic), settings, sharing, live preview.
// State lives in `form`; every change goes through touch(), which autosaves and refreshes the preview.
import { db, validSlug, slugify } from './store.js';
import { h, toast, modal, copy, debounce, confirmBox } from './ui.js';
import { TYPES, newBlock, newId, isQuestion, hasOptions, isScale, scaleOf, validateDoc } from '/forms/core.js';
import { mountForm, notice } from '/forms/render.js';
import { mountResults } from './results.js';
import { config } from './config.js';

const IMAGES = ['assets/screens/home.png', 'assets/screens/insights.png', 'assets/screens/profile.png', 'assets/og-image.png'];
const OPS = { eq: 'is', neq: 'is not', includes: 'includes', gt: 'is more than', lt: 'is less than', answered: 'is answered', not_answered: 'is not answered' };
const SHORT = { short_text: 'Text', long_text: 'Long', email: 'Email', number: 'Number', date: 'Date', single_choice: 'One', multi_choice: 'Many', dropdown: 'List', ranking: 'Rank', yes_no: 'Y/N', rating: 'Stars', scale: 'Scale', mood_slider: 'Mood', illustrated_scale: 'Faces', week_scale: 'Week', info_text: 'Info', info_image: 'Image', divider: 'Line' };
const GROUPS = ['Text', 'Choice', 'Scale', 'CalmCampus', 'Content'];

export async function mountEditor(app, id, tab, { shell }) {
  const form = await db.getForm(id);
  if (!form) throw new Error('Form not found.');
  let published = form.current_version ? await db.version(id, form.current_version) : null;
  const sel = { kind: 'block', id: form.draft.pages[0]?.blocks[0]?.id || null };
  const ui = { previewStart: 'selected', wide: false, addOpen: null };
  const dead = { v: false };

  const stateLine = h('span', { class: 'stateline', 'aria-live': 'polite', text: 'Saved' });
  const publishBtn = h('button', { class: 'btn sm', onClick: publish });
  const snapshot = () => JSON.stringify({ d: form.draft, s: form.settings, m: form.privacy_mode });
  const pubSnapshot = () => published ? JSON.stringify({ d: published.doc, s: published.settings, m: published.privacy_mode }) : null;
  const dirty = () => !published || snapshot() !== pubSnapshot();

  function refreshHeader() {
    const st = form.status;
    publishBtn.disabled = st === 'archived' || (st === 'published' && !dirty());
    publishBtn.textContent = st === 'archived' ? 'Archived' : !form.current_version ? 'Publish' : st === 'closed' ? 'Publish & reopen' : dirty() ? 'Publish changes' : 'Published ✓';
  }
  const header = () => shell(form.title, stateLine, publishBtn);
  const page = h('div');
  app.replaceChildren(header(), page);

  // ── autosave ──
  const doSave = async () => {
    stateLine.textContent = 'Saving…';
    try {
      const r = await db.updateForm(id, { title: form.title, slug: form.slug, privacy_mode: form.privacy_mode, draft: form.draft, settings: form.settings });
      form.updated_at = r.updated_at; stateLine.textContent = 'Saved'; refreshHeader();
    } catch (e) { stateLine.textContent = e.code === '23505' || e.status === 409 ? 'Not saved: that link name is taken' : 'Not saved: ' + e.message; }
  };
  const save = debounce(doSave, 700);
  const refreshPreview = debounce(() => drawPreview(), 350);
  function touch(opts = {}) { stateLine.textContent = 'Unsaved changes…'; save(); if (!opts.noPreview) refreshPreview(); refreshHeader(); }
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save.flush(); }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && tab === 'build' && sel.kind === 'block') { e.preventDefault(); moveBlock(sel.id, e.key === 'ArrowUp' ? -1 : 1); }
  };
  const onUnload = (e) => { if (stateLine.textContent !== 'Saved') { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', onUnload);

  // ── helpers over the document ──
  const pages = () => form.draft.pages;
  const allBlocks = () => pages().flatMap((p) => p.blocks);
  const findBlock = (bid) => { for (const p of pages()) { const i = p.blocks.findIndex((b) => b.id === bid); if (i >= 0) return { page: p, i, block: p.blocks[i] }; } return null; };
  function moveBlock(bid, d) {
    const f = findBlock(bid); if (!f) return;
    const j = f.i + d;
    if (j >= 0 && j < f.page.blocks.length) { [f.page.blocks[f.i], f.page.blocks[j]] = [f.page.blocks[j], f.page.blocks[f.i]]; }
    else { const pi = pages().indexOf(f.page) + d, np = pages()[pi]; if (!np) return; f.page.blocks.splice(f.i, 1); d < 0 ? np.blocks.push(f.block) : np.blocks.unshift(f.block); }
    touch(); drawBuild(); document.querySelector(`[data-blk="${bid}"]`)?.focus();
  }
  function movePage(pid, d) { const i = pages().findIndex((p) => p.id === pid), j = i + d; if (j < 0 || j >= pages().length) return; [pages()[i], pages()[j]] = [pages()[j], pages()[i]]; touch(); drawBuild(); }
  const label = (b) => b.label?.trim() || (b.type === 'info_text' ? (b.text || 'Text').slice(0, 40) : TYPES[b.type].label);

  // ── Build tab ──
  const outline = h('nav', { class: 'pane outline', 'aria-label': 'Form outline' });
  const inspector = h('section', { class: 'pane insp', 'aria-label': 'Edit' });
  const frame = h('div', { class: 'frame' });
  const previewPane = h('aside', { class: 'pane preview', 'aria-label': 'Live preview' });

  function drawOutline() {
    outline.replaceChildren(...pages().map((p, pi) => h('div', { class: 'pg' },
      h('div', { class: 'pg-h' },
        h('button', { class: 'title', 'aria-current': sel.kind === 'page' && sel.id === p.id, onClick: () => { sel.kind = 'page'; sel.id = p.id; drawBuild(); }, text: `Page ${pi + 1}${p.title ? ': ' + p.title : ''}` }),
        h('button', { class: 'iconbtn', 'aria-label': 'Move page up', disabled: pi === 0, onClick: () => movePage(p.id, -1), text: '↑' }),
        h('button', { class: 'iconbtn', 'aria-label': 'Move page down', disabled: pi === pages().length - 1, onClick: () => movePage(p.id, 1), text: '↓' })),
      p.blocks.map((b) => h('button', { class: 'blk' + (b.show_if ? ' cond' : ''), 'data-blk': b.id, 'aria-current': sel.kind === 'block' && sel.id === b.id, onClick: () => { sel.kind = 'block'; sel.id = b.id; drawBuild(); if (ui.previewStart === 'selected') drawPreview(); }, title: b.show_if ? 'Shown only when a condition is met' : false },
        h('span', { class: 't', text: label(b) }), h('span', { class: 'ty', text: SHORT[b.type] }))),
      ui.addOpen === p.id ? addMenu(p) : h('button', { class: 'btn ghost sm', onClick: () => { ui.addOpen = p.id; drawOutline(); setTimeout(() => outline.querySelector('.addmenu button')?.focus()); }, text: '+ Add block' }))),
      h('button', { class: 'btn ghost sm', onClick: () => { const p = { id: newId('p'), title: '', blocks: [] }; pages().push(p); sel.kind = 'page'; sel.id = p.id; touch(); drawBuild(); }, text: '+ Add page' }));
  }
  function addMenu(p) {
    return h('div', { class: 'addmenu', role: 'group', 'aria-label': 'Add a block' }, GROUPS.flatMap((g) => [h('h4', { text: g }),
      ...Object.entries(TYPES).filter(([, t]) => t.group === g).map(([type, t]) => h('button', { type: 'button', onClick: () => {
        const b = newBlock(type);
        if (type === 'mood_slider') { b.label = 'How’s your energy right now?'; b.minLabel = 'Drained'; b.maxLabel = 'Energised'; }
        if (type === 'week_scale') b.label = 'How’s your week been?';
        p.blocks.push(b); sel.kind = 'block'; sel.id = b.id; ui.addOpen = null; touch(); drawBuild();
        setTimeout(() => inspector.querySelector('textarea, input')?.focus());
      }, text: t.label }))]),
      h('button', { type: 'button', class: 'btn ghost sm', style: false, onClick: () => { ui.addOpen = null; drawOutline(); }, text: 'Cancel' }));
  }

  const fld = (lbl, input, hint, id) => h('div', { class: 'field' }, h('label', { for: id || input.id, text: lbl }), input, hint && h('p', { class: 'hint', text: hint }));
  let uidn = 0; const uid = () => 'f' + ++uidn;
  const text = (obj, key, { area = false, ph = '', max, onInput } = {}) => {
    const el = h(area ? 'textarea' : 'input', { type: area ? false : 'text', id: uid(), value: area ? false : (obj[key] ?? ''), placeholder: ph, maxlength: max, onInput: (e) => { const v = e.target.value; if (v === '') delete obj[key]; else obj[key] = v; touch(); onInput && onInput(); } });
    if (area) el.value = obj[key] ?? ''; return el;
  };
  const check = (lbl, checked, fn, hint) => { const i = h('input', { type: 'checkbox', id: uid(), checked, onChange: (e) => fn(e.target.checked) }); return h('div', { class: 'check' }, i, h('label', { for: i.id }, lbl, hint && h('span', { class: 'hint', style: false }, ' ', hint))); };

  function drawInspector() {
    if (sel.kind === 'page') {
      const p = pages().find((x) => x.id === sel.id); if (!p) { inspector.replaceChildren(h('p', { text: 'Nothing selected.' })); return; }
      inspector.replaceChildren(h('h2', { text: 'Page' }),
        fld('Page title', text(p, 'title', { ph: 'Shown above the questions' }), 'Used as the heading in page view.'),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost sm danger', disabled: pages().length === 1, onClick: async () => {
          if (!(await confirmBox('Delete this page?', `It has ${p.blocks.length} block(s), which will be removed.`))) return;
          form.draft.pages = pages().filter((x) => x !== p); sel.kind = 'block'; sel.id = allBlocks()[0]?.id; touch(); drawBuild();
        }, text: 'Delete page' })));
      return;
    }
    const f = findBlock(sel.id);
    if (!f) { inspector.replaceChildren(h('h2', { text: 'Start here' }), h('p', { class: 'sub', text: 'Add a block from the outline, or pick one to edit.' })); return; }
    const b = f.block, q = isQuestion(b);
    const parts = [h('h2', { text: TYPES[b.type].label })];
    if (b.type === 'info_text') parts.push(fld('Text', text(b, 'text', { area: true }), 'Blank line = new paragraph. {{questionId}} pipes in an earlier answer.'));
    else if (b.type === 'info_image') {
      const sel2 = h('select', { id: uid(), onChange: (e) => { b.src = e.target.value; touch(); } }, h('option', { value: '', text: 'Choose an image…' }), IMAGES.map((s) => h('option', { value: s, text: s.replace('assets/', '') })));
      sel2.value = b.src || '';
      parts.push(fld('Image', sel2, 'Only images from the CalmCampus asset library, so forms stay on-brand.'), fld('Description (alt text)', text(b, 'alt'), 'For screen readers.'));
    } else if (q) {
      parts.push(fld('Question', text(b, 'label', { area: true, onInput: () => { outline.querySelector(`[data-blk="${b.id}"] .t`).textContent = label(b); } })), fld('Help text (optional)', text(b, 'help', { area: true })));
      parts.push(check('Required', !!b.required, (v) => { b.required = v; touch(); }, '— everything else stays skippable'));
    }
    if (hasOptions(b)) {
      const list = h('div');
      const drawOpts = () => list.replaceChildren(...b.options.map((o, i) => h('div', { class: 'opt-row' },
        h('input', { type: 'text', 'aria-label': `Option ${i + 1}`, value: o.label, onInput: (e) => { o.label = e.target.value; touch(); } }),
        h('button', { class: 'iconbtn', 'aria-label': 'Move up', disabled: i === 0, onClick: () => { [b.options[i - 1], b.options[i]] = [b.options[i], b.options[i - 1]]; touch(); drawOpts(); }, text: '↑' }),
        h('button', { class: 'iconbtn', 'aria-label': 'Move down', disabled: i === b.options.length - 1, onClick: () => { [b.options[i + 1], b.options[i]] = [b.options[i], b.options[i + 1]]; touch(); drawOpts(); }, text: '↓' }),
        h('button', { class: 'iconbtn', 'aria-label': 'Remove option', disabled: b.options.length <= 2, onClick: () => { b.options.splice(i, 1); touch(); drawOpts(); drawLogicSoon(); }, text: '×' }))),
        h('button', { class: 'btn ghost sm', onClick: () => { b.options.push({ id: newId('o'), label: `Option ${b.options.length + 1}` }); touch(); drawOpts(); setTimeout(() => list.querySelector('.opt-row:last-of-type input')?.select()); }, text: '+ Add option' }));
      drawOpts(); parts.push(h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Options' }), list));
      if (b.type !== 'ranking') parts.push(check('Add an “Other” option with a text box', !!b.other, (v) => { b.other = v; touch(); }));
      if (b.type === 'multi_choice') parts.push(fld('Limit how many can be picked', h('input', { type: 'number', id: uid(), min: 1, value: b.maxChoices ?? '', onInput: (e) => { e.target.value ? b.maxChoices = +e.target.value : delete b.maxChoices; touch(); } }), 'Leave empty for no limit.'));
    }
    if (q && (isScale(b))) {
      const sc = scaleOf(b);
      if (b.type === 'scale' || b.type === 'rating') parts.push(fld('Highest value', h('input', { type: 'number', id: uid(), min: 3, max: b.type === 'rating' ? 10 : 10, value: sc.max, onInput: (e) => { b.max = Math.min(10, Math.max(3, +e.target.value || sc.max)); touch(); } })));
      if (b.type !== 'week_scale' && b.type !== 'rating') parts.push(fld('Label for the lowest end', text(b, 'minLabel', { ph: 'e.g. Not at all' })), fld('Label for the highest end', text(b, 'maxLabel', { ph: 'e.g. Very' })));
    }
    if (b.type === 'short_text' || b.type === 'long_text') parts.push(fld('Maximum length', h('input', { type: 'number', id: uid(), min: 10, max: 5000, value: b.maxLength ?? '', onInput: (e) => { e.target.value ? b.maxLength = Math.min(5000, +e.target.value) : delete b.maxLength; touch(); } })));
    if (b.type === 'number') parts.push(h('div', { class: 'row' }, fld('Minimum', h('input', { type: 'number', id: uid(), value: b.min ?? '', onInput: (e) => { e.target.value !== '' ? b.min = +e.target.value : delete b.min; touch(); } })), fld('Maximum', h('input', { type: 'number', id: uid(), value: b.max ?? '', onInput: (e) => { e.target.value !== '' ? b.max = +e.target.value : delete b.max; touch(); } }))));
    if (q) parts.push(h('p', { class: 'hint', text: `Id: ${b.id}. Use {{${b.id}}} in other text to pipe this answer in.` }));
    if (b.type !== 'divider' || true) parts.push(logicEditor(b, f));
    parts.push(h('div', { class: 'row' },
      h('button', { class: 'btn ghost sm', onClick: () => moveBlock(b.id, -1), text: '↑ Move up' }), h('button', { class: 'btn ghost sm', onClick: () => moveBlock(b.id, 1), text: '↓ Move down' }),
      h('button', { class: 'btn ghost sm', onClick: () => { const c = structuredClone(b); c.id = newId('q'); if (c.options) c.options = c.options.map((o) => ({ ...o, id: newId('o') })); c.label = c.label ? c.label + ' (copy)' : c.label; f.page.blocks.splice(f.i + 1, 0, c); sel.id = c.id; touch(); drawBuild(); }, text: 'Duplicate' }),
      h('button', { class: 'btn ghost sm danger', onClick: () => { f.page.blocks.splice(f.i, 1); for (const x of allBlocks()) if (x.show_if) { const k = x.show_if.all ? 'all' : 'any'; x.show_if[k] = x.show_if[k].filter((c) => c.q !== b.id); if (!x.show_if[k].length) delete x.show_if; } sel.id = f.page.blocks[Math.max(0, f.i - 1)]?.id || allBlocks()[0]?.id || null; touch(); drawBuild(); toast('Block deleted'); }, text: 'Delete' })));
    parts.push(h('p', { class: 'hint', text: 'Shortcuts: Ctrl/⌘+S saves now · Alt+↑/↓ moves the selected block.' }));
    inspector.replaceChildren(...parts);
  }
  let drawLogicSoon = () => {};

  function logicEditor(b, f) {
    const wrap = h('div', { class: 'field' });
    const earlier = () => { const out = []; for (const x of allBlocks()) { if (x.id === b.id) break; if (isQuestion(x)) out.push(x); } return out; };
    const draw = () => {
      const mode = b.show_if?.any ? 'any' : 'all', conds = b.show_if ? (b.show_if.any || b.show_if.all) : [];
      const prev = earlier();
      wrap.replaceChildren(h('span', { class: 'lbl', text: 'Show only if…' }),
        !conds.length && h('p', { class: 'hint', text: prev.length ? 'Always shown. Add a condition to show this only for some answers.' : 'Always shown. (Conditions can use any question that comes before this one.)' }),
        conds.length > 1 && (() => { const s = h('select', { 'aria-label': 'Match', onChange: (e) => { const list = b.show_if.all || b.show_if.any; b.show_if = { [e.target.value]: list }; touch(); } }, h('option', { value: 'all', text: 'All of these are true' }), h('option', { value: 'any', text: 'Any of these is true' })); s.value = mode; return s; })(),
        ...conds.map((c, i) => {
          const src = prev.find((x) => x.id === c.q);
          const qs = h('select', { 'aria-label': 'Question', onChange: (e) => { c.q = e.target.value; c.value = undefined; touch(); draw(); } }, prev.map((x) => h('option', { value: x.id, text: label(x).slice(0, 50) }))); qs.value = c.q;
          const ops = h('select', { 'aria-label': 'Condition', onChange: (e) => { c.op = e.target.value; if (c.op === 'answered' || c.op === 'not_answered') delete c.value; touch(); draw(); } }, Object.entries(OPS).map(([k, v]) => h('option', { value: k, text: v }))); ops.value = c.op;
          let val = h('span');
          if (c.op !== 'answered' && c.op !== 'not_answered') {
            const choices = !src ? null : hasOptions(src) ? [...src.options.map((o) => [o.id, o.label]), ...(src.other ? [['other', 'Other']] : [])] : src.type === 'yes_no' ? [['yes', 'Yes'], ['no', 'No']] : isScale(src) ? Array.from({ length: scaleOf(src).max - scaleOf(src).min + 1 }, (_, k) => [String(scaleOf(src).min + k), String(scaleOf(src).min + k)]) : null;
            if (choices) { val = h('select', { 'aria-label': 'Value', onChange: (e) => { c.value = e.target.value; touch(); } }, h('option', { value: '', text: 'Choose…' }), choices.map(([v, t]) => h('option', { value: v, text: t }))); val.value = c.value ?? ''; }
            else val = h('input', { type: 'text', 'aria-label': 'Value', value: c.value ?? '', onInput: (e) => { c.value = e.target.value; touch(); } });
          }
          return h('div', { class: 'cond-row' }, qs, ops, val, h('button', { class: 'iconbtn', 'aria-label': 'Remove condition', onClick: () => { const k = b.show_if.all ? 'all' : 'any'; b.show_if[k].splice(i, 1); if (!b.show_if[k].length) delete b.show_if; touch(); draw(); drawOutline(); }, text: '×' }));
        }),
        prev.length > 0 && h('button', { class: 'btn ghost sm', onClick: () => { const c = { q: prev[prev.length - 1].id, op: 'eq' }; if (b.show_if) (b.show_if.all || b.show_if.any).push(c); else b.show_if = { all: [c] }; touch(); draw(); drawOutline(); }, text: '+ Add condition' }));
    };
    draw(); drawLogicSoon = draw; return wrap;
  }

  // ── preview ──
  function drawPreview() {
    if (dead.v) return;
    const f = findBlock(sel.id);
    const startAt = ui.previewStart === 'selected' ? (sel.kind === 'block' && f && isQuestion(f.block) ? f.block.id : 'intro') : ui.previewStart;
    frame.replaceChildren(); frame.className = 'frame' + (ui.wide ? ' wide' : ''); frame.dataset.accent = form.settings.accent || '';
    const root = h('div'); frame.append(root);
    const view = { slug: form.slug || 'preview', title: form.title, version: 0, privacy_mode: form.privacy_mode, doc: structuredClone(form.draft), settings: form.settings, open: true };
    try { mountForm(root, view, { preview: true, startAt, assetBase: '/' }); } catch (e) { frame.textContent = 'Preview error: ' + e.message; }
  }
  function drawPreviewPane() {
    const seg = (label, key) => h('button', { class: 'btn sm ' + (ui.previewStart === key ? '' : 'ghost'), 'aria-pressed': ui.previewStart === key, onClick: () => { ui.previewStart = key; drawPreviewPane(); drawPreview(); }, text: label });
    previewPane.replaceChildren(h('div', { class: 'seg', role: 'group', 'aria-label': 'Preview' }, seg('Selected', 'selected'), seg('Intro', 'intro'), seg('Thank-you', 'done'),
      h('button', { class: 'btn sm ghost', 'aria-pressed': ui.wide, onClick: () => { ui.wide = !ui.wide; drawPreview(); }, text: ui.wide ? 'Phone' : 'Wide' })), frame);
    drawPreview();
  }

  const problemsBox = h('div');
  const buildView = h('div', { class: 'editor' }, outline, inspector, previewPane);
  function drawBuild() { drawOutline(); drawInspector(); }
  const togglePrev = h('button', { class: 'btn ghost sm', onClick: () => buildView.classList.toggle('show-preview'), text: 'Preview' });

  // ── Settings tab ──
  function settingsView() {
    const s = form.settings, anon = form.privacy_mode !== 'identified';
    const sel1 = (key, opts, def) => { const e = h('select', { id: uid(), onChange: (ev) => { ev.target.value ? s[key] = ev.target.value : delete s[key]; touch(); } }, opts.map(([v, t]) => h('option', { value: v, text: t }))); e.value = s[key] ?? def; return e; };
    const dt = (key) => { const e = h('input', { type: 'datetime-local', id: uid(), value: s[key] ? new Date(s[key]).toISOString().slice(0, 16) : '', onChange: (ev) => { ev.target.value ? s[key] = new Date(ev.target.value).toISOString() : delete s[key]; touch(); } }); return e; };
    const num = (key, ph) => h('input', { type: 'number', id: uid(), min: 1, placeholder: ph, value: s[key] ?? '', onInput: (e) => { e.target.value ? s[key] = +e.target.value : delete s[key]; touch(); } });
    const slugIn = h('input', { type: 'text', id: 'slug', value: form.slug, maxlength: 60, onInput: (e) => {
      const v = e.target.value.toLowerCase(); e.target.value = v; const ok = validSlug(v); slugHint.textContent = ok ? `${config.publicOrigin}/f/${v}` : 'Use 3–60 lowercase letters, numbers and single hyphens.'; slugHint.className = 'hint' + (ok ? '' : ' msg err');
      if (ok) { form.slug = v; touch({ noPreview: true }); } } });
    const slugHint = h('p', { class: 'hint', text: `${config.publicOrigin}/f/${form.slug}` });
    const mode = (v, t, d) => { const i = h('input', { type: 'radio', name: 'pm', id: 'pm-' + v, checked: form.privacy_mode === v, onChange: () => { form.privacy_mode = v; touch(); render(); } }); return h('div', { class: 'check' }, i, h('label', { for: i.id }, h('b', { text: t }), h('span', { class: 'hint', text: ' ' + d }))); };

    return h('div', { class: 'settings' },
      h('h2', { text: 'Basics' }),
      fld('Title', text(form, 'title', { onInput: () => { document.querySelector('.bar .crumb').textContent = form.title || 'Untitled'; } })),
      h('div', { class: 'field' }, h('label', { for: 'slug', text: 'Link name' }), slugIn, slugHint, form.current_version && h('p', { class: 'hint', text: 'Changing this changes the public link. Anyone with the old link will see “not found”.' })),
      h('h2', { text: 'Privacy mode' }),
      mode('anonymous', 'Anonymous', 'No account, no email, no IP or device details stored. Answers carry only the week. Nobody, including you, can link a person to their answers.'),
      mode('identified', 'Identified', 'You collect a name and email with explicit consent and a retention period. Respondents get a code to delete their answers.'),
      form.current_version && h('p', { class: 'hint', text: 'Privacy mode changes apply from the next publish.' }),
      h('h2', { text: 'Look' }),
      fld('Layout', sel1('view', [['pages', 'Classic: one page at a time'], ['steps', 'Gentle: one question at a time']], 'pages')),
      h('div', { class: 'row' }, fld('Accent', sel1('accent', [['', 'Terracotta'], ['sage', 'Sage']], '')), fld('Cover', sel1('cover', [['', 'None'], ['sage', 'Sage circles'], ['terracotta', 'Terracotta circles']], ''))),
      h('p', { class: 'hint', text: 'Forms always use the CalmCampus design system, in light and dark mode. Only on-brand options are offered.' }),
      h('h2', { text: 'Words' }),
      fld('Intro', text(s, 'intro', { area: true, ph: 'A calm sentence or two about what this is and how long it takes.' })),
      fld('Thank-you message', text(s, 'thanks', { area: true })),
      fld('Redirect after sending (optional)', text(s, 'redirect', { ph: 'https://…' }), 'Must start with https://. The thank-you message shows first.'),
      check('Show the crisis resources note on the last screen', s.wellbeing !== false && s.crisis !== false, (v) => { v ? (delete s.wellbeing, s.crisis === false && delete s.crisis) : (s.wellbeing = false); touch(); }, 'Recommended whenever a form touches wellbeing.'),
      fld('Custom crisis wording (optional)', text(s, 'crisis', { area: true }), 'Leave empty to use the standard CalmCampus wording.'),
      h('h2', { text: 'Privacy notice' }),
      h('p', { class: 'hint', text: 'Shown before the first question. The summary line and the table below are generated from your settings, so it can’t drift from what the form really does.' }),
      fld('Who sees the answers', text(s, 'who', { area: true, ph: 'The CalmCampus team (students at UCLL, Belgium)…' })),
      anon ? fld('How long it’s kept', text(s, 'retention_text', { area: true, ph: 'Until this study ends…' }))
           : h('div', {}, fld('Retention (days)', num('retention_days', '90'), 'Identified answers are deleted automatically after this.'), fld('Purpose', text(s, 'purpose', { area: true })), fld('Consent wording', text(s, 'consent', { area: true }), 'The checkbox respondents tick. Leave empty for the default.')),
      fld('Contact address in the notice', text(s, 'contact_email', { ph: 'contact@calm.braunf.com' })),
      noticePreview(),
      anon && h('div', {}, h('h2', { text: 'Follow-up contact' }),
        check('Offer an optional email box after the form', !!s.follow_up?.enabled, (v) => { s.follow_up = { ...(s.follow_up || {}), enabled: v }; touch(); render(); }, 'Stored separately from the answers, with no link between them. The form says so.'),
        s.follow_up?.enabled && h('div', {}, fld('Heading', text(s.follow_up, 'title')), fld('Text', text(s.follow_up, 'text', { area: true })), fld('Button', text(s.follow_up, 'button')))),
      h('h2', { text: 'Access' }),
      h('div', { class: 'row' }, fld('Opens', dt('opens_at')), fld('Closes', dt('closes_at'))),
      fld('Response limit', num('max_responses', 'No limit'), 'The form closes by itself when this many answers are in.'),
      check('Remember on the device that it was answered', !!s.one_per_device, (v) => { v ? s.one_per_device = true : delete s.one_per_device; touch(); }, 'A note on the respondent’s own device only. It can be cleared, and nothing identifying is sent to us, so anonymity is intact.'),
      h('p', { class: 'hint', text: 'Settings go live when you publish.' }));
  }
  function noticePreview() {
    const wrap = h('div', { class: 'cc-form', style: false });
    wrap.append(notice({ privacy_mode: form.privacy_mode, settings: form.settings })); wrap.querySelector('details').open = true; wrap.className = 'cc-form noticewrap'; return wrap;
  }

  // ── Share tab ──
  function shareView() {
    const url = `${config.publicOrigin}/f/${form.slug}`;
    const live = form.status === 'published';
    const embed = `<iframe src="${url}" title="${form.title.replace(/"/g, '&quot;')}" width="100%" height="720" style="border:0" loading="lazy"></iframe>`;
    const ro = (v) => h('input', { type: 'text', readonly: true, value: v, 'aria-label': 'Link', onFocus: (e) => e.target.select() });
    return h('div', { class: 'share' },
      h('h2', { text: 'Status' }),
      h('p', {}, h('span', { class: `tag ${form.status}`, text: form.status }), ' ', form.status === 'draft' ? 'Not public yet. Publish it to get a working link.' : live ? 'Taking answers.' : form.status === 'closed' ? 'Closed. The link shows a “closed” page.' : 'Archived.'),
      h('div', { class: 'row' },
        live && h('button', { class: 'btn ghost sm', onClick: async () => { await db.updateForm(id, { status: 'closed' }); form.status = 'closed'; toast('Closed'); render(); refreshHeader(); }, text: 'Close the form' }),
        form.status === 'closed' && h('button', { class: 'btn ghost sm', onClick: async () => { await db.updateForm(id, { status: 'published' }); form.status = 'published'; toast('Reopened'); render(); refreshHeader(); }, text: 'Reopen' })),
      h('h2', { text: 'Public link' }),
      h('div', { class: 'copy' }, ro(url), h('button', { class: 'btn sm', onClick: () => copy(url), text: 'Copy' })),
      live && h('p', {}, h('a', { href: url, target: '_blank', rel: 'noopener', text: 'Open the public page ↗' })),
      h('h2', { text: 'Embed' }),
      h('p', { class: 'hint', text: 'Paste this where you want the form to appear. It loads the CalmCampus page, with no third-party code.' }),
      h('div', { class: 'copy' }, ro(embed), h('button', { class: 'btn sm', onClick: () => copy(embed), text: 'Copy' })));
  }

  // ── Publish ──
  async function publish() {
    save.flush(); await doSave();
    const problems = validateDoc(form.draft);
    if (form.privacy_mode === 'identified' && !form.settings.retention_days) form.settings.retention_days = 90;
    if (form.settings.redirect && !/^https:\/\//.test(form.settings.redirect)) problems.push('The redirect must start with https://');
    if (!validSlug(form.slug)) problems.push('The link name is not valid.');
    if (problems.length) { await modal('Fix these first', h('ul', { class: 'problems' }, problems.map((p) => h('li', { text: p }))), [{ label: 'OK', value: true }]); return; }
    if (!form.current_version) {
      const ok = await modal('Publish this form?', h('div', {}, h('p', { text: `It goes live at ${config.publicOrigin}/f/${form.slug}.` }), h('p', { text: form.privacy_mode === 'anonymous' ? 'It’s anonymous: no one, including you, will be able to tell who answered.' : 'It collects names and emails with consent, kept for ' + (form.settings.retention_days || 90) + ' days.' })), [{ label: 'Not yet', value: false }, { label: 'Publish', value: true, cls: 'btn' }]);
      if (!ok) return;
    }
    publishBtn.disabled = true;
    try {
      await db.updateForm(id, { settings: form.settings, draft: form.draft, privacy_mode: form.privacy_mode });
      const v = await db.publish(id); form.current_version = v; form.status = 'published';
      published = await db.version(id, v); toast(`Published (version ${v})`); refreshHeader(); if (tab === 'share') render();
    } catch (e) { toast('Couldn’t publish: ' + e.message); refreshHeader(); }
  }

  // ── tabs ──
  function render() {
    const names = [['build', 'Build'], ['settings', 'Settings'], ['share', 'Share'], ['results', 'Results']];
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, names.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': k === tab, onClick: () => { location.hash = `#/f/${id}/${k}`; }, text: t })), h('span', { style: false, class: 'grow' }), tab === 'build' && togglePrev);
    let body;
    if (tab === 'build') { body = buildView; drawBuild(); drawPreviewPane(); }
    else if (tab === 'settings') body = settingsView();
    else if (tab === 'share') body = shareView();
    else { body = h('div', { class: 'results' }); mountResults(body, form, id).catch((e) => body.replaceChildren(h('p', { class: 'msg err', text: e.message }))); }
    page.replaceChildren(tabs, body);
  }
  refreshHeader(); render();
  return () => { dead.v = true; window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); save.flush(); };
}
