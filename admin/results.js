// Results: stats, drop-off, per-question summaries, filterable table, CSV/JSON export, deletion.
// Groups smaller than MIN_GROUP are never shown in a breakdown or filter.
import { db } from './store.js';
import { config } from './config.js';
import { h, toast, confirmBox, download, fmtDate } from './ui.js';
import { summarize, toCsv, shuffled, isQuestion, hasOptions, MIN_GROUP, TYPES } from '/forms/core.js';

export async function mountResults(root, form, id) {
  root.replaceChildren(h('p', { class: 'sub', text: 'Loading results…' }));
  const identified = form.privacy_mode === 'identified';
  const [versions, reach, followUps, rawRows] = await Promise.all([db.versions(id), db.reach(id), identified ? [] : db.followUps(id), identified ? db.identified(id) : db.responses(id)]);
  if (!versions.length) return root.replaceChildren(h('div', { class: 'empty' }, h('p', { text: 'Nothing here yet. Publish the form and share the link.' })));
  const all = shuffled(rawRows.map((r) => ({ ...r, week: r.week || r.submitted_on })));   // shuffled: order never reveals submission order
  const st = { version: 'all', q: '', fq: '', fv: '', limit: 100 };

  const docFor = () => (st.version === 'all' ? versions[0] : versions.find((v) => String(v.version) === st.version)).doc;
  const inScope = () => all.filter((r) => st.version === 'all' || String(r.version) === st.version);

  function matches(r, doc) {
    if (st.fq) { const v = r.answers[st.fq]; const hit = Array.isArray(v) ? v.includes(st.fv) : String(v) === st.fv; if (!hit) return false; }
    if (st.q) { const needle = st.q.toLowerCase(); const hay = JSON.stringify(Object.values(r.answers)).toLowerCase() + (r.contact ? JSON.stringify(r.contact).toLowerCase() : ''); if (!hay.includes(needle)) return false; }
    return true;
  }

  function draw() {
    const doc = docFor(), scope = inScope(), qs = doc.pages.flatMap((p) => p.blocks).filter(isQuestion);
    const filtered = scope.filter((r) => matches(r, doc));
    const filtering = !!(st.q || st.fq);
    const hide = filtering && filtered.length < MIN_GROUP;
    const label = (b, x) => (x === 'other' ? 'Other' : (b.options || []).find((o) => o.id === x)?.label ?? x);
    const cell = (b, v) => v === undefined ? '' : hasOptions(b) ? (Array.isArray(v) ? v.map((x) => label(b, x)).join(', ') : label(b, v)) : Array.isArray(v) ? v.join(', ') : String(v);

    // funnel
    const first = doc.pages[0]?.id;
    const rv = (pid) => reach.filter((r) => r.page_id === pid && (st.version === 'all' || String(r.version) === st.version)).reduce((a, r) => a + r.reached, 0);
    const started = Math.max(rv(first), scope.length);
    const finishedPct = started ? Math.round((scope.length / started) * 100) : null;
    const weeks = {}; for (const r of scope) weeks[r.week] = (weeks[r.week] || 0) + 1;

    const vSel = h('select', { 'aria-label': 'Version', onChange: (e) => { st.version = e.target.value; st.fq = ''; st.fv = ''; draw(); } }, h('option', { value: 'all', text: 'All versions' }), versions.map((v) => h('option', { value: String(v.version), text: `Version ${v.version} (${fmtDate(v.published_at)})` }))); vSel.value = st.version;
    const fqSel = h('select', { 'aria-label': 'Filter by question', onChange: (e) => { st.fq = e.target.value; st.fv = ''; draw(); } }, h('option', { value: '', text: 'Filter by answer…' }), qs.filter((b) => hasOptions(b) && b.type !== 'ranking' || b.type === 'yes_no').map((b) => h('option', { value: b.id, text: b.label.slice(0, 60) }))); fqSel.value = st.fq;
    const fb = st.fq && qs.find((b) => b.id === st.fq);
    const fvSel = fb && h('select', { 'aria-label': 'Answer', onChange: (e) => { st.fv = e.target.value; draw(); } }, h('option', { value: '', text: 'Any' }), (fb.type === 'yes_no' ? [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] : [...fb.options, ...(fb.other ? [{ id: 'other', label: 'Other' }] : [])]).map((o) => h('option', { value: o.id, text: o.label })));
    if (fvSel) fvSel.value = st.fv;
    const search = h('input', { type: 'search', 'aria-label': 'Search answers', placeholder: 'Search answers…', value: st.q, onInput: (e) => { st.q = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(() => { draw(); document.querySelector('.results input[type=search]')?.focus(); }, 300); } });

    const exportRows = scope.map((r) => ({ week: r.week, answers: r.answers, extra: identified ? [r.contact?.name || '', r.contact?.email || ''] : [] }));
    const exports = h('div', { class: 'row' },
      h('button', { class: 'btn sm', onClick: () => download(`${form.slug}-responses.csv`, toCsv(doc, exportRows, identified ? ['name', 'email'] : []), 'text/csv'), text: 'Download CSV' }),
      h('button', { class: 'btn sm ghost', onClick: () => download(`${form.slug}-responses.json`, JSON.stringify({ form: form.slug, privacy_mode: form.privacy_mode, exported: new Date().toISOString().slice(0, 10), questions: qs.map((b) => ({ id: b.id, label: b.label, type: b.type, options: b.options })), responses: shuffled(scope).map((r) => ({ week: r.week, answers: r.answers, ...(identified ? { contact: r.contact } : {}) })) }, null, 2), 'application/json'), text: 'Download JSON' }),
      h('button', { class: 'btn sm ghost danger', disabled: !all.length, onClick: async () => {
        if (!(await confirmBox('Delete all responses?', `This permanently deletes ${all.length} response(s) for “${form.title}”. Export first if you need them.`, 'Delete all'))) return;
        if (identified) await Promise.all(all.map((r) => db.deleteIdentified(r.id))); else await db.deleteResponses(id);
        toast('Deleted'); mountResults(root, form, id);
      }, text: 'Delete all' }));

    const sums = hide ? [] : summarize(doc, filtered.map((r) => r.answers));
    const chart = (s) => h('article', { class: 'q-sum' }, h('h3', { text: s.label }),
      h('p', { class: 'n', text: `${s.n} answered${s.skipped ? `, ${s.skipped} skipped` : ''}${s.mean != null ? ` · average ${s.mean}` : ''}` }),
      s.empty ? h('p', { class: 'suppressed', text: 'No answers yet.' }) : s.suppressed ? h('p', { class: 'suppressed', text: `Only ${s.n} answered, fewer than ${MIN_GROUP}, so no breakdown is shown.` })
        : s.bars ? (() => { const max = Math.max(1, ...s.bars.map((b) => b.count)); return s.bars.map((b) => h('div', { class: 'bar-row' }, h('span', { text: b.label }), h('div', { class: 'track', 'aria-hidden': 'true' }, h('div', { class: 'fill', style: false, 'data-w': Math.round((b.count / max) * 100) })), h('span', { class: 'v', text: s.type === 'ranking' ? `avg #${b.avgRank}` : `${b.count} (${s.n ? Math.round((b.count / s.n) * 100) : 0}%)` }))); })()
        : s.texts ? h('div', { class: 'texts' }, s.texts.slice(0, 60).map((t) => h('p', { text: String(t) }))) : null);

    const shown = hide ? [] : filtered.slice(0, st.limit);
    const table = hide ? h('p', { class: 'note', text: `Fewer than ${MIN_GROUP} responses match this filter, so they’re hidden. That protects respondents from being picked out.` })
      : h('div', {}, h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', { text: 'Week' }), identified && h('th', { text: 'Contact' }), qs.map((b) => h('th', { text: b.label.slice(0, 40) })), h('th', { 'aria-label': 'Actions' }))),
        h('tbody', {}, shown.map((r) => h('tr', {}, h('td', { text: r.week }), identified && h('td', { text: [r.contact?.name, r.contact?.email].filter(Boolean).join(' · ') }), qs.map((b) => h('td', { text: cell(b, r.answers[b.id]).slice(0, 200) })),
          h('td', {}, h('button', { class: 'btn sm ghost danger', onClick: async () => { if (await confirmBox('Delete this response?', 'It can’t be undone.')) { await (identified ? db.deleteIdentified(r.id) : db.deleteResponse(r.id)); toast('Deleted'); mountResults(root, form, id); } }, text: 'Delete' }))))))),
        filtered.length > st.limit && h('p', { class: 'hint' }, `Showing ${st.limit} of ${filtered.length}. `, h('button', { class: 'btn sm ghost', onClick: () => { st.limit += 200; draw(); }, text: 'Show more' })));

    const kids = [
      h('div', { class: 'filters' }, vSel), 
      h('div', { class: 'stats' }, stat(scope.length, 'responses'), stat(started || '–', 'started'), stat(finishedPct == null ? '–' : finishedPct + '%', 'finished'), !identified && stat(followUps.length, 'follow-up emails')),
      scope.length === 0 && !filtering && h('p', { class: 'note' }, 'No responses yet. Share ', h('b', { text: `${config.publicOrigin}/f/${form.slug}` }), ' to start collecting. This page fills in as answers arrive.'),
      h('h2', { text: 'Where people drop off' }),
      h('div', { class: 'q-sum' }, doc.pages.map((p, i) => { const n = rv(p.id); const base = Math.max(rv(first), 1); return h('div', { class: 'bar-row' }, h('span', { text: `${i + 1}. ${p.title || 'Page ' + (i + 1)}` }), h('div', { class: 'track', 'aria-hidden': 'true' }, h('div', { class: 'fill', 'data-w': Math.min(100, Math.round((n / base) * 100)) })), h('span', { class: 'v', text: `${n}` })); }),
        h('div', { class: 'bar-row' }, h('span', { text: 'Sent' }), h('div', { class: 'track', 'aria-hidden': 'true' }, h('div', { class: 'fill', 'data-w': Math.min(100, Math.round((scope.length / Math.max(rv(first), 1)) * 100)) })), h('span', { class: 'v', text: String(scope.length) })),
        h('p', { class: 'hint', text: 'Plain counters per page. Nothing ties them to a person or to an answer.' })),
      Object.keys(weeks).length > 1 && h('div', {}, h('h2', { text: 'Responses by week' }), h('div', { class: 'q-sum' }, Object.entries(weeks).sort().map(([w, n]) => h('div', { class: 'bar-row' }, h('span', { text: 'Week of ' + w }), h('div', { class: 'track', 'aria-hidden': 'true' }, h('div', { class: 'fill', 'data-w': Math.round((n / Math.max(...Object.values(weeks))) * 100) })), h('span', { class: 'v', text: String(n) }))))),
      h('h2', { text: 'Answers by question' }),
      h('div', { class: 'filters' }, search, fqSel, fvSel), filtering && !hide && h('p', { class: 'note', text: `${filtered.length} responses match.` }),
      hide ? table : sums.map(chart),
      h('h2', { text: 'Responses' }), exports,
      !identified && !filtering && scope.length > 0 && scope.length < MIN_GROUP && h('p', { class: 'note', text: `Only ${scope.length} so far. With so few, free-text answers could identify someone, so handle them carefully.` }),
      hide ? null : table,
      !identified && followUps.length > 0 && h('details', {}, h('summary', { text: `Follow-up emails (${followUps.length}), kept apart from the answers` }),
        h('p', { class: 'hint', text: 'These carry only the week. Nothing connects them to a response.' }),
        h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', onClick: () => download(`${form.slug}-follow-ups.csv`, 'email\r\n' + shuffled(followUps).map((f) => f.contact).join('\r\n') + '\r\n', 'text/csv'), text: 'Download emails' })),
        h('div', { class: 'texts' }, shuffled(followUps).map((f) => h('p', {}, f.contact, ' ', h('button', { class: 'btn sm ghost danger', onClick: async () => { await db.deleteFollowUp(f.id); mountResults(root, form, id); }, text: 'Remove' })))))];
    root.replaceChildren(...kids.flat(Infinity).filter(Boolean));
    // widths are set through CSSOM (the admin CSP forbids inline style attributes)
    root.querySelectorAll('.fill[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  }
  const stat = (n, t) => h('div', { class: 'stat' }, h('b', { text: String(n) }), h('span', { text: t }));
  draw();
}
