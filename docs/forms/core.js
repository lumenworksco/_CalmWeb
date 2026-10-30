// Form document model, logic, validation, summaries and export.
// Pure functions with no DOM and no network: the browser (preview, renderer, admin) and the
// ingest Worker import this same file, so what the respondent sees is what the server enforces.
//
// Document: { pages: [{ id, title?, blocks: [Block] }] }
// Block:    { id, type, label?, help?, required?, options?, other?, min?, max?, minLabel?, maxLabel?,
//             maxLength?, show_if? }
// show_if:  { all: [Cond] } | { any: [Cond] }   Cond: { q, op, value? }
// Answers:  { [blockId]: value }; "Other" text lives under `${blockId}.other`.

export const MIN_GROUP = 5; // smallest group any breakdown may show

export const TYPES = {
  short_text:       { label: 'Short text',        group: 'Text',    question: true },
  long_text:        { label: 'Long text',         group: 'Text',    question: true },
  email:            { label: 'Email',             group: 'Text',    question: true },
  number:           { label: 'Number',            group: 'Text',    question: true },
  date:             { label: 'Date',              group: 'Text',    question: true },
  single_choice:    { label: 'Single choice',     group: 'Choice',  question: true, options: true },
  multi_choice:     { label: 'Multiple choice',   group: 'Choice',  question: true, options: true },
  dropdown:         { label: 'Dropdown',          group: 'Choice',  question: true, options: true },
  ranking:          { label: 'Ranking',           group: 'Choice',  question: true, options: true },
  yes_no:           { label: 'Yes / No',          group: 'Choice',  question: true },
  rating:           { label: 'Rating (stars)',    group: 'Scale',   question: true, scale: { min: 1, max: 5 } },
  scale:            { label: 'Number scale',      group: 'Scale',   question: true, scale: { min: 1, max: 7 } },
  mood_slider:      { label: 'Mood / energy slider', group: 'CalmCampus', question: true, scale: { min: 1, max: 5 } },
  illustrated_scale:{ label: 'Illustrated scale', group: 'CalmCampus', question: true, scale: { min: 1, max: 5 } },
  week_scale:       { label: '“How’s your week been?”', group: 'CalmCampus', question: true, scale: { min: 1, max: 5 } },
  info_text:        { label: 'Text',              group: 'Content', question: false },
  info_image:       { label: 'Image',             group: 'Content', question: false },
  divider:          { label: 'Divider',           group: 'Content', question: false },
};

export const isQuestion = (b) => !!TYPES[b.type]?.question;
export const hasOptions = (b) => !!TYPES[b.type]?.options;
export const isScale = (b) => !!TYPES[b.type]?.scale;
export const scaleOf = (b) => ({ ...TYPES[b.type].scale, ...(Number.isInteger(b.min) ? { min: b.min } : {}), ...(Number.isInteger(b.max) ? { max: b.max } : {}) });

const uid = (p) => p + Math.random().toString(36).slice(2, 8);
export const newId = uid;

export function newBlock(type) {
  const b = { id: uid('q'), type, label: '', required: false };
  if (hasOptions(b)) b.options = [{ id: uid('o'), label: 'Option 1' }, { id: uid('o'), label: 'Option 2' }];
  if (type === 'info_text') { b.label = ''; b.text = ''; }
  return b;
}
export const emptyDoc = () => ({ pages: [{ id: uid('p'), title: '', blocks: [] }] });

// ── Logic ────────────────────────────────────────────────────────────────────────────
const answered = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

export const OPS = {
  eq:           (a, v) => answered(a) && String(a) === String(v),
  neq:          (a, v) => !answered(a) || String(a) !== String(v),
  includes:     (a, v) => Array.isArray(a) && a.includes(v),
  gt:           (a, v) => answered(a) && Number(a) > Number(v),
  lt:           (a, v) => answered(a) && Number(a) < Number(v),
  answered:     (a) => answered(a),
  not_answered: (a) => !answered(a),
};

export function isShown(block, answers) {
  const rule = block.show_if;
  if (!rule) return true;
  const list = rule.all || rule.any || [];
  if (list.length === 0) return true;
  const test = (c) => (OPS[c.op] || (() => false))(answers[c.q], c.value);
  return rule.any ? list.some(test) : list.every(test);
}

// Blocks a respondent can currently see (a page with none is skipped). A block whose condition
// depends on a hidden block is treated as unanswered-but-evaluated, which is the usual semantics.
export function visiblePages(doc, answers) {
  const hidden = new Set();
  const out = [];
  for (const page of doc.pages) {
    const blocks = [];
    for (const b of page.blocks) {
      const dependsOnHidden = [...(b.show_if?.all || b.show_if?.any || [])].some((c) => hidden.has(c.q));
      if (!dependsOnHidden && isShown(b, answers)) blocks.push(b); else hidden.add(b.id);
    }
    if (blocks.length) out.push({ ...page, blocks });
  }
  return out;
}

// "{{q1}}" in text becomes the respondent's answer (option label for choices).
export function pipe(text, doc, answers) {
  if (!text || !text.includes('{{')) return text || '';
  const all = new Map(doc.pages.flatMap((p) => p.blocks).map((b) => [b.id, b]));
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, id) => {
    const b = all.get(id), v = answers[id];
    if (!b || !answered(v)) return 'something';
    if (hasOptions(b) && b.type !== 'ranking') {
      const label = (x) => (b.options.find((o) => o.id === x) || {}).label || answers[`${id}.other`] || '';
      return Array.isArray(v) ? v.map(label).join(', ') : label(v);
    }
    return String(v).slice(0, 80);
  });
}

// ── Validation ───────────────────────────────────────────────────────────────────────
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_TEXT = 5000;

// Returns { value } (cleaned) or { error }. `value` undefined means "no answer".
export function checkAnswer(b, raw, answers = {}) {
  const empty = !answered(raw);
  if (empty) return b.required ? { error: 'This one is marked required.' }: { value: undefined };
  const optIds = new Set((b.options || []).map((o) => o.id));
  const fail = (m) => ({ error: m });
  switch (b.type) {
    case 'short_text': case 'long_text': {
      if (typeof raw !== 'string') return fail('Please enter text.');
      const max = Math.min(b.maxLength || (b.type === 'short_text' ? 200 : MAX_TEXT), MAX_TEXT);
      if (raw.length > max) return fail(`Please keep this under ${max} characters.`);
      return { value: raw.trim() };
    }
    case 'email': return typeof raw === 'string' && EMAIL.test(raw.trim()) && raw.length <= 320 ? { value: raw.trim() } : fail('That doesn’t look like an email address.');
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return fail('Please enter a number.');
      if (Number.isFinite(b.min) && n < b.min) return fail(`Please enter ${b.min} or more.`);
      if (Number.isFinite(b.max) && n > b.max) return fail(`Please enter ${b.max} or less.`);
      return { value: n };
    }
    case 'date': return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? { value: raw } : fail('Please pick a date.');
    case 'yes_no': return raw === 'yes' || raw === 'no' ? { value: raw } : fail('Please choose yes or no.');
    case 'single_choice': case 'dropdown': {
      if (typeof raw !== 'string') return fail('Please choose one.');
      if (raw === 'other' && b.other) {
        const t = answers[`${b.id}.other`];
        if (b.required && !answered(t)) return fail('Please say what “other” is.');
        return { value: raw };
      }
      return optIds.has(raw) ? { value: raw } : fail('Please choose one of the options.');
    }
    case 'multi_choice': {
      if (!Array.isArray(raw) || new Set(raw).size !== raw.length) return fail('Please choose from the options.');
      if (!raw.every((x) => optIds.has(x) || (x === 'other' && b.other))) return fail('Please choose from the options.');
      if (Number.isInteger(b.maxChoices) && raw.length > b.maxChoices) return fail(`Please choose up to ${b.maxChoices}.`);
      return { value: raw };
    }
    case 'ranking': {
      if (!Array.isArray(raw) || raw.length !== optIds.size || new Set(raw).size !== raw.length || !raw.every((x) => optIds.has(x))) return fail('Please rank every option.');
      return { value: raw };
    }
    case 'rating': case 'scale': case 'mood_slider': case 'illustrated_scale': case 'week_scale': {
      const { min, max } = scaleOf(b), n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isInteger(n) && n >= min && n <= max ? { value: n } : fail(`Please pick a value from ${min} to ${max}.`);
    }
    default: return { value: undefined };
  }
}

// Validates a whole submission against the document. Keeps only answers to questions the
// respondent could actually see, so crafted requests can't smuggle in extra keys or hidden answers.
export function validateSubmission(doc, answers) {
  const errors = {}, clean = {};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return { ok: false, errors: { _: 'bad payload' }, clean };
  for (const page of visiblePages(doc, answers)) {
    for (const b of page.blocks) {
      if (!isQuestion(b)) continue;
      const r = checkAnswer(b, answers[b.id], answers);
      if (r.error) errors[b.id] = r.error;
      else if (r.value !== undefined) {
        clean[b.id] = r.value;
        const otherSelected = r.value === 'other' || (Array.isArray(r.value) && r.value.includes('other'));
        const t = answers[`${b.id}.other`];
        if (b.other && otherSelected && typeof t === 'string' && t.trim()) clean[`${b.id}.other`] = t.trim().slice(0, 300);
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}

// Builder-side sanity check of a document before publishing.
export function validateDoc(doc) {
  const problems = [], ids = new Set();
  if (!doc?.pages?.length) return ['The form has no pages.'];
  let questions = 0;
  for (const p of doc.pages) {
    if (ids.has(p.id)) problems.push(`Duplicate id ${p.id}`); ids.add(p.id);
    for (const b of p.blocks) {
      if (ids.has(b.id)) problems.push(`Duplicate id ${b.id}`); ids.add(b.id);
      if (!TYPES[b.type]) { problems.push(`Unknown block type ${b.type}`); continue; }
      if (isQuestion(b)) { questions++; if (!b.label?.trim()) problems.push('A question has no text.'); }
      if (hasOptions(b)) {
        if ((b.options || []).length < 2) problems.push(`“${b.label || b.type}” needs at least two options.`);
        if ((b.options || []).some((o) => !o.label?.trim())) problems.push(`“${b.label || b.type}” has an empty option.`);
      }
    }
  }
  const order = doc.pages.flatMap((p) => p.blocks.map((b) => b.id));
  for (const b of doc.pages.flatMap((p) => p.blocks))
    for (const c of b.show_if?.all || b.show_if?.any || [])
      if (order.indexOf(c.q) === -1 || order.indexOf(c.q) >= order.indexOf(b.id)) problems.push(`“${b.label || b.type}” depends on a question that doesn’t come before it.`);
  if (!questions) problems.push('Add at least one question.');
  return problems;
}

// ── Results ──────────────────────────────────────────────────────────────────────────
// `rows` are response answer objects. Anything shown for fewer than MIN_GROUP rows is suppressed.
export function summarize(doc, rows) {
  const out = [];
  for (const b of doc.pages.flatMap((p) => p.blocks).filter(isQuestion)) {
    const vals = rows.map((r) => r[b.id]).filter(answered);
    const s = { id: b.id, type: b.type, label: b.label, n: vals.length, skipped: rows.length - vals.length };
    if (vals.length === 0) { s.empty = true; out.push(s); continue; }
    if (vals.length < MIN_GROUP) { s.suppressed = true; out.push(s); continue; }
    if (hasOptions(b) && b.type !== 'ranking') {
      const counts = Object.fromEntries([...b.options.map((o) => o.id), ...(b.other ? ['other'] : [])].map((k) => [k, 0]));
      for (const v of vals) for (const x of Array.isArray(v) ? v : [v]) if (x in counts) counts[x]++;
      s.bars = Object.entries(counts).map(([k, c]) => ({ key: k, label: k === 'other' ? 'Other' : b.options.find((o) => o.id === k).label, count: c }));
    } else if (b.type === 'ranking') {
      const pts = Object.fromEntries(b.options.map((o) => [o.id, 0]));
      for (const v of vals) v.forEach((id, i) => { pts[id] += b.options.length - i; });
      s.bars = b.options.map((o) => ({ key: o.id, label: o.label, count: pts[o.id], avgRank: +(vals.reduce((a, v) => a + v.indexOf(o.id) + 1, 0) / vals.length).toFixed(2) })).sort((a, b2) => a.avgRank - b2.avgRank);
    } else if (b.type === 'yes_no') {
      s.bars = ['yes', 'no'].map((k) => ({ key: k, label: k === 'yes' ? 'Yes' : 'No', count: vals.filter((v) => v === k).length }));
    } else if (isScale(b)) {
      const { min, max } = scaleOf(b);
      s.bars = Array.from({ length: max - min + 1 }, (_, i) => ({ key: String(min + i), label: String(min + i), count: vals.filter((v) => v === min + i).length }));
      s.mean = vals.length ? +(vals.reduce((a, v) => a + v, 0) / vals.length).toFixed(2) : null;
    } else if (b.type === 'number') {
      s.mean = vals.length ? +(vals.reduce((a, v) => a + v, 0) / vals.length).toFixed(2) : null;
    } else { s.texts = vals; }
    out.push(s);
  }
  return out;
}

// Deterministic shuffle is NOT used: exports are shuffled so row order can't reveal submission order.
export function shuffled(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const csvCell = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection from free text
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Human-readable CSV: option ids become labels. `rows` are { week?, answers }.
export function toCsv(doc, rows, extraHeads = []) {
  const qs = doc.pages.flatMap((p) => p.blocks).filter(isQuestion);
  const label = (b, x) => (x === 'other' ? 'Other' : (b.options || []).find((o) => o.id === x)?.label ?? x);
  const head = ['week', ...extraHeads, ...qs.flatMap((b) => (b.other ? [b.label, `${b.label} (other)`] : [b.label]))];
  const lines = [head.map(csvCell).join(',')];
  for (const r of shuffled(rows)) {
    const cells = [r.week ?? '', ...(r.extra || [])];
    for (const b of qs) {
      const v = r.answers[b.id];
      cells.push(hasOptions(b) ? (Array.isArray(v) ? v.map((x) => label(b, x)) : v === undefined ? '' : label(b, v)) : v);
      if (b.other) cells.push(r.answers[`${b.id}.other`]);
    }
    lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
