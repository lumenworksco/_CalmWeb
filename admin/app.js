// CalmCampus forms admin: shell, login and the forms list. Hash-routed, no framework.
import { auth, db, slugify } from './store.js';
import { h, toast, modal, confirmBox, copy } from './ui.js';
import { TEMPLATES } from '/forms/templates.js';
import { emptyDoc } from '/forms/core.js';
import { config } from './config.js';
import { mountEditor } from './editor.js';

const app = document.getElementById('app');
const LOGO = '/assets/brand/first-sprout-horizontal-color.svg';
let cleanup = null;

function shell(crumb, ...right) {
  return h('header', { class: 'bar' }, h('a', { href: '#/', 'aria-label': 'All forms' }, h('picture', {}, h('source', { media: '(prefers-color-scheme: dark)', srcset: '/assets/brand/first-sprout-horizontal-reversed.svg' }), h('img', { src: LOGO, alt: 'CalmCampus' }))),
    h('div', { class: 'grow crumb', text: crumb }), ...right,
    h('button', { class: 'btn ghost sm', onClick: async () => { await auth.signOut(); route(); }, text: 'Sign out' }));
}

// ── Login: Supabase email code, then RLS decides if you are an admin ─────────────────────
function login() {
  let email = '', handler = null;
  const msg = h('p', { class: 'msg', role: 'status' });
  const box = h('form', { onSubmit: (e) => { e.preventDefault(); handler && handler(); } });
  const say = (text, err) => { msg.textContent = text; msg.className = 'msg' + (err ? ' err' : ''); };
  const askEmail = () => {
    const input = h('input', { type: 'email', id: 'em', autocomplete: 'email', required: true, value: email });
    box.replaceChildren(h('div', { class: 'field' }, h('label', { for: 'em', text: 'Email' }), input), h('button', { class: 'btn', type: 'submit', text: 'Send me a code' }));
    handler = async () => { email = input.value.trim(); say(''); try { await auth.sendCode(email); askCode(); } catch (err) { say(err.message, true); } };
    input.focus();
  };
  const askCode = () => {
    const input = h('input', { type: 'text', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 10, required: true });
    box.replaceChildren(h('p', { class: 'sub', text: `We sent a code to ${email}.` }), h('div', { class: 'field' }, h('label', { for: 'code', text: 'Code' }), input),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: 'Sign in' }), h('button', { class: 'btn ghost', type: 'button', onClick: askEmail, text: 'Back' })));
    handler = async () => { try { await auth.verify(email, input.value.trim()); location.hash = '#/'; route(); } catch (err) { say(err.message, true); } };
    input.focus();
  };
  app.replaceChildren(h('main', { class: 'login' }, h('img', { src: LOGO, alt: 'CalmCampus', height: 34 }), h('h1', { text: 'Forms' }),
    h('p', { class: 'sub', text: 'Private. Only invited people can sign in.' }), box, msg));
  askEmail();
}

// ── Forms list ────────────────────────────────────────────────────────────────────────
async function list() {
  app.replaceChildren(shell('Forms', h('button', { class: 'btn sm', onClick: newForm, text: 'New form' })), h('main', { class: 'page' }, h('h1', { text: 'Your forms' }), h('p', { class: 'sub', text: 'Loading…' })));
  let forms;
  try { forms = await db.listForms(); } catch (e) { return fail(e); }
  if (!(await auth.isAdmin())) return app.replaceChildren(shell('Forms'), h('main', { class: 'page' }, h('h1', { text: 'Not an admin' }), h('p', { class: 'sub', text: `${auth.email} is signed in but isn’t on the admin list. Add the user id to the admins table in Supabase (see README).` })));
  const counts = await db.counts(forms.map((f) => f.id)).catch(() => ({}));
  const body = forms.length ? h('div', { class: 'cards' }, forms.map((f) => card(f, counts[f.id] ?? 0)))
    : h('div', { class: 'empty' }, h('p', { text: 'No forms yet.' }), h('p', {}, h('button', { class: 'btn', onClick: newForm, text: 'Create your first form' })));
  app.replaceChildren(shell('Forms', h('button', { class: 'btn sm', onClick: newForm, text: 'New form' })),
    h('main', { class: 'page' }, h('h1', { text: 'Your forms' }), h('p', { class: 'sub', text: 'Create, share and read what students tell you, calmly.' }), body));
}

function card(f, n) {
  const url = `${config.publicOrigin}/f/${f.slug}`;
  const act = (label, fn, cls = 'ghost') => h('button', { class: `btn sm ${cls}`, onClick: fn, text: label });
  return h('article', { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: `tag ${f.status}`, text: f.status }), h('span', { class: 'tag', text: f.privacy_mode })),
    h('h3', {}, h('a', { href: `#/f/${f.id}`, text: f.title })),
    h('div', { class: 'meta' }, h('span', { text: f.status === 'published' ? n + (n === 1 ? ' response' : ' responses') : f.status === 'draft' ? 'Not published yet' : n + ' responses' }), h('span', { text: '/f/' + f.slug })),
    h('div', { class: 'actions' },
      h('a', { class: 'btn sm', href: `#/f/${f.id}`, text: 'Edit' }), h('a', { class: 'btn sm ghost', href: `#/f/${f.id}/results`, text: 'Results' }),
      f.status !== 'draft' && f.status !== 'archived' && act('Copy link', () => copy(url)),
      act('Duplicate', () => duplicate(f)),
      act(f.status === 'archived' ? 'Unarchive' : 'Archive', async () => { await db.updateForm(f.id, { status: f.status === 'archived' ? (f.current_version ? 'closed' : 'draft') : 'archived' }); toast('Updated'); list(); }),
      act('Delete', () => remove(f), 'danger')));
}

async function duplicate(f) {
  const full = await db.getForm(f.id);
  const copy = await db.createForm({ slug: `${f.slug}-copy`.slice(0, 55), title: `${f.title} (copy)`, privacy_mode: full.privacy_mode, draft: full.draft, settings: full.settings });
  toast('Duplicated as a draft'); location.hash = `#/f/${copy.id}`;
}

async function remove(f) {
  const input = h('input', { type: 'text', 'aria-label': `Type ${f.slug} to confirm`, placeholder: f.slug });
  const body = h('div', {}, h('p', { text: `This permanently deletes “${f.title}” and every response to it. This can’t be undone. Export first if you need the data. Type ${f.slug} to confirm.` }), input);
  const r = await modal('Delete this form?', body, [{ label: 'Cancel', value: false }, { label: 'Delete forever', value: true, cls: 'danger' }]);
  if (r && input.value.trim() === f.slug) { await db.deleteForm(f.id); toast('Deleted'); list(); } else if (r) toast('Name didn’t match, nothing deleted');
}

async function newForm() {
  const pick = (t) => { dlg.close(); create(t); };
  const body = h('div', { class: 'tpl' },
    h('button', { type: 'button', onClick: () => pick(null) }, h('b', { text: 'Blank form' }), h('span', { text: 'Start from scratch.' })),
    TEMPLATES.map((t) => h('button', { type: 'button', onClick: () => pick(t) }, h('b', { text: t.name }), h('span', { text: `${t.blurb}` }))));
  const dlg = h('dialog', { 'aria-labelledby': 'nt' }, h('h2', { id: 'nt', text: 'New form' }), body, h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => dlg.close(), text: 'Cancel' })));
  dlg.addEventListener('close', () => dlg.remove()); document.body.append(dlg); dlg.showModal();
}
async function create(t) {
  const title = t ? t.title : 'Untitled form';
  const f = await db.createForm({ slug: t ? t.id : 'new-form', title, privacy_mode: t ? t.privacy_mode : 'anonymous', draft: t ? structuredClone(t.doc) : emptyDoc(), settings: t ? structuredClone(t.settings) : { view: 'pages', cover: 'sage', wellbeing: true } });
  location.hash = `#/f/${f.id}`;
}

function fail(e) { app.replaceChildren(shell('Forms'), h('main', { class: 'page' }, h('h1', { text: 'Something went wrong' }), h('p', { class: 'sub', text: e.message }))); }

// ── Router ────────────────────────────────────────────────────────────────────────────
async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  if (!auth.signedIn) { if (location.hash !== '#/login') history.replaceState(null, '', '#/login'); return login(); }
  const m = location.hash.match(/^#\/f\/([0-9a-f-]{36})(?:\/(\w+))?/);
  try {
    if (m) cleanup = await mountEditor(app, m[1], m[2] || 'build', { shell });
    else await list();
  } catch (e) { fail(e); }
}
window.addEventListener('hashchange', route);
route();
