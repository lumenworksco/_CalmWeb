// Supabase access for the admin: email-code login (GoTrue) and the tables (PostgREST).
// Plain fetch, no SDK, nothing loaded from a CDN. Row-level security decides what each call may do.
import { config } from './config.js';

const KEY = 'cc-admin-session';
let session = null;
try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* storage may be blocked */ }
const save = (s) => { session = s; try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* ignore */ } };

const base = () => config.supabaseUrl;
async function raw(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const h = { apikey: config.anonKey, ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (auth && session) h.authorization = `Bearer ${session.access_token}`;
  return fetch(base() + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function refresh() {
  if (!session?.refresh_token) return false;
  const r = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false });
  if (!r.ok) { save(null); return false; }
  save(await r.json()); return true;
}
async function api(path, opts) {
  let r = await raw(path, opts);
  if (r.status === 401 && (await refresh())) r = await raw(path, opts);
  if (r.status === 401) { save(null); location.hash = '#/login'; throw new Error('Please sign in again.'); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw Object.assign(new Error(e.message || `Request failed (${r.status})`), { code: e.code, status: r.status }); }
  return r;
}
// PostgREST caps a response (Supabase default: 1000 rows). Page through so results and exports are never silently cut.
async function allRows(path) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const chunk = await rows(`${path}&limit=1000&offset=${offset}`);
    out.push(...chunk); if (chunk.length < 1000) return out;
  }
}
const rows = async (path, opts) => { const r = await api(path, opts); return r.status === 204 ? [] : r.json(); };

export const auth = {
  get signedIn() { return !!session; },
  get email() { return session?.user?.email || ''; },
  async sendCode(email) { const r = await raw('/auth/v1/otp', { method: 'POST', body: { email, create_user: false }, auth: false }); if (!r.ok) throw new Error('Couldn’t send a code. Check the address.'); },
  async verify(email, token) {
    const r = await raw('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token }, auth: false });
    if (!r.ok) throw new Error('That code didn’t work. It may have expired.');
    save(await r.json());
  },
  async signOut() { try { await raw('/auth/v1/logout', { method: 'POST' }); } catch { /* ignore */ } save(null); },
  async isAdmin() { try { return (await rows('/rest/v1/admins?select=user_id')).length > 0; } catch { return false; } },
};

const slugOk = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
export const validSlug = (s) => slugOk.test(s) && s.length >= 3 && s.length <= 60;

export const db = {
  listForms: () => rows('/rest/v1/forms?select=id,slug,title,status,privacy_mode,current_version,updated_at&order=updated_at.desc'),
  getForm: async (id) => (await rows(`/rest/v1/forms?id=eq.${id}&select=*`))[0],
  async createForm(f) {
    for (let i = 0; i < 20; i++) {
      try { return (await rows('/rest/v1/forms', { method: 'POST', headers: { prefer: 'return=representation' }, body: { ...f, slug: i ? `${f.slug}-${i + 1}` : f.slug } }))[0]; }
      catch (e) { if (e.code !== '23505' && e.status !== 409) throw e; }
    }
    throw new Error('Couldn’t find a free slug.');
  },
  async updateForm(id, patch) { return (await rows(`/rest/v1/forms?id=eq.${id}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: { ...patch, updated_at: new Date().toISOString() } }))[0]; },
  deleteForm: (id) => rows(`/rest/v1/forms?id=eq.${id}`, { method: 'DELETE' }),
  async publish(id) { const r = await api('/rest/v1/rpc/publish_form', { method: 'POST', body: { p_form_id: id } }); return r.json(); },
  async version(id, v) { return (await rows(`/rest/v1/form_versions?form_id=eq.${id}&version=eq.${v}&select=*`))[0]; },
  versions: (id) => rows(`/rest/v1/form_versions?form_id=eq.${id}&select=version,doc,published_at&order=version.desc`),
  responses: (id) => allRows(`/rest/v1/responses?form_id=eq.${id}&select=id,version,week,answers&order=id.asc`),
  identified: (id) => allRows(`/rest/v1/identified_responses?form_id=eq.${id}&select=id,version,submitted_on,answers,contact,retention_until&order=id.asc`),
  reach: (id) => rows(`/rest/v1/page_reach?form_id=eq.${id}&select=version,page_id,reached`),
  followUps: (id) => allRows(`/rest/v1/follow_ups?form_id=eq.${id}&select=id,week,contact&order=id.asc`),
  deleteResponses: (id) => rows(`/rest/v1/responses?form_id=eq.${id}`, { method: 'DELETE' }),
  deleteResponse: (id) => rows(`/rest/v1/responses?id=eq.${id}`, { method: 'DELETE' }),
  deleteIdentified: (id) => rows(`/rest/v1/identified_responses?id=eq.${id}`, { method: 'DELETE' }),
  deleteFollowUp: (id) => rows(`/rest/v1/follow_ups?id=eq.${id}`, { method: 'DELETE' }),
  async counts(ids) {
    const out = {};
    await Promise.all(ids.map(async (id) => {
      const r = await api(`/rest/v1/responses?form_id=eq.${id}&select=id&limit=1`, { headers: { prefer: 'count=exact' } });
      out[id] = +(r.headers.get('content-range') || '0/0').split('/')[1];
    }));
    return out;
  },
};
