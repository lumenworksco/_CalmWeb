// In-memory stand-in for the slice of Supabase the forms platform uses (PostgREST tables, the
// respondent RPCs, and GoTrue email-code login). For local development and tests only:
// it mirrors supabase/migrations/*.sql semantics, but is not a security boundary.

const ADMIN_TOKEN = 'dev-admin-token';
const monday = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const now = () => new Date().toISOString();
const json = (b, status = 200, headers = {}) => new Response(b === undefined ? null : JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...headers } });

export function createFake() {
  const t = { admins: [{ user_id: 'dev-admin' }], forms: [], form_versions: [], responses: [], page_reach: [], follow_ups: [], identified_responses: [] };
  const DEFAULTS = {
    forms: () => ({ id: crypto.randomUUID(), status: 'draft', privacy_mode: 'anonymous', draft: { pages: [] }, settings: {}, current_version: null, created_at: now(), updated_at: now() }),
    responses: () => ({ id: crypto.randomUUID() }),
  };
  const formBySlug = (slug) => t.forms.find((f) => f.slug === slug);
  const pub = (slug) => {
    const f = formBySlug(slug);
    if (!f || !['published', 'closed'].includes(f.status)) return null;
    const v = t.form_versions.find((x) => x.form_id === f.id && x.version === f.current_version);
    const st = v.settings, n = t.responses.filter((r) => r.form_id === f.id).length + t.identified_responses.filter((r) => r.form_id === f.id).length;
    const open = f.status === 'published' && (!st.opens_at || new Date(st.opens_at) <= new Date()) && (!st.closes_at || new Date(st.closes_at) > new Date()) && (st.max_responses == null || n < st.max_responses);
    return { slug: f.slug, title: f.title, version: v.version, privacy_mode: v.privacy_mode, doc: v.doc, settings: v.settings, open };
  };
  const rpcs = {
    get_public_form: ({ p_slug }) => pub(p_slug),
    submit_response: ({ p_slug, p_answers }) => {
      const p = pub(p_slug); if (!p || !p.open || p.privacy_mode !== 'anonymous' || JSON.stringify(p_answers).length > 65536) return false;
      t.responses.push({ id: crypto.randomUUID(), form_id: formBySlug(p_slug).id, version: p.version, week: monday(), answers: p_answers }); return true;
    },
    submit_identified: ({ p_slug, p_answers, p_contact, p_token_hash }) => {
      const p = pub(p_slug); if (!p || !p.open || p.privacy_mode !== 'identified') return false;
      const days = p.settings.retention_days ?? 90;
      t.identified_responses.push({ id: crypto.randomUUID(), form_id: formBySlug(p_slug).id, version: p.version, submitted_on: now().slice(0, 10), answers: p_answers, contact: p_contact, consented_at: now(), retention_until: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10), delete_token_hash: p_token_hash }); return true;
    },
    delete_identified: ({ p_token_hash }) => { const n = t.identified_responses.length; t.identified_responses = t.identified_responses.filter((r) => r.delete_token_hash !== p_token_hash); return t.identified_responses.length < n; },
    purge_expired: () => { const n = t.identified_responses.length; t.identified_responses = t.identified_responses.filter((r) => r.retention_until >= now().slice(0, 10)); return n - t.identified_responses.length; },
    track_page: ({ p_slug, p_version, p_page_id }) => {
      const f = formBySlug(p_slug); if (!f || f.status !== 'published' || f.current_version !== p_version) return null;
      let r = t.page_reach.find((x) => x.form_id === f.id && x.version === p_version && x.page_id === p_page_id);
      if (!r) t.page_reach.push(r = { form_id: f.id, version: p_version, page_id: p_page_id, reached: 0 }); r.reached++; return null;
    },
    reshuffle_anonymous: () => { for (const k of ['responses', 'follow_ups']) t[k].sort(() => Math.random() - 0.5); return null; },
    submit_follow_up: ({ p_slug, p_contact }) => { const f = formBySlug(p_slug); const p = pub(p_slug); if (!f || !p || p.privacy_mode !== 'anonymous' || !p.settings.follow_up?.enabled) return false; t.follow_ups.push({ id: crypto.randomUUID(), form_id: f.id, week: monday(), contact: p_contact }); return true; },
    publish_form: ({ p_form_id }) => {
      const f = t.forms.find((x) => x.id === p_form_id); if (!f) throw new Error('no such form');
      f.current_version = (f.current_version || 0) + 1; f.status = 'published'; f.updated_at = now();
      t.form_versions.push({ form_id: f.id, version: f.current_version, privacy_mode: f.privacy_mode, doc: structuredClone(f.draft), settings: structuredClone(f.settings), published_at: now() }); return f.current_version;
    },
  };
  const SERVICE_ONLY = new Set(['get_public_form', 'submit_response', 'submit_identified', 'delete_identified', 'purge_expired', 'reshuffle_anonymous', 'track_page', 'submit_follow_up']);

  function filterRows(rows, params) {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      const [op, ...rest] = v.split('.'), val = rest.join('.');
      if (op === 'eq') rows = rows.filter((r) => String(r[k]) === val);
      else if (op === 'in') { const set = new Set(val.slice(1, -1).split(',')); rows = rows.filter((r) => set.has(String(r[k]))); }
    }
    const order = params.get('order');
    if (order) { const [col, dir] = order.split('.'); rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
    const off = +(params.get('offset') || 0);
    return params.get('limit') ? rows.slice(off, off + Math.min(+params.get('limit'), 1000)) : rows.slice(off, off + 1000); // the real API caps at 1000 rows too
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/supabase/, '');
    const auth = request.headers.get('authorization') || '';
    const isAdmin = auth === `Bearer ${ADMIN_TOKEN}`;
    const body = ['POST', 'PATCH', 'PUT'].includes(request.method) ? await request.json().catch(() => ({})) : null;

    // GoTrue (email code login; the dev code is always 000000)
    if (path === '/auth/v1/otp') return json({});
    if (path === '/auth/v1/verify') return body.token === '000000'
      ? json({ access_token: ADMIN_TOKEN, refresh_token: 'dev-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'dev-admin', email: body.email } })
      : json({ error: 'invalid', msg: 'Token has expired or is invalid' }, 403);
    if (path === '/auth/v1/token') return json({ access_token: ADMIN_TOKEN, refresh_token: 'dev-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'dev-admin', email: 'dev@localhost' } });
    if (path === '/auth/v1/logout') return new Response(null, { status: 204 });

    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop();
      if (!rpcs[fn]) return json({ message: 'not found' }, 404);
      const serviceOk = request.headers.get('apikey') === 'dev-service-key';
      if (SERVICE_ONLY.has(fn) ? !serviceOk : !isAdmin) return json({ message: 'permission denied' }, 401);
      try { return json(rpcs[fn](body || {})); } catch (e) { return json({ message: e.message }, 400); }
    }
    const table = path.startsWith('/rest/v1/') && path.split('/')[3];
    if (table && t[table]) {
      if (!isAdmin) return json({ message: 'permission denied' }, 401);
      const wantObj = (request.headers.get('accept') || '').includes('vnd.pgrst.object');
      const rep = (request.headers.get('prefer') || '').includes('return=representation');
      if (request.method === 'GET') {
        const rows = filterRows(t[table], url.searchParams);
        const headers = (request.headers.get('prefer') || '').includes('count=exact') ? { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } : {};
        if (wantObj) return rows.length === 1 ? json(rows[0], 200, headers) : json({ message: 'no rows' }, 406);
        return json(rows, 200, headers);
      }
      if (request.method === 'POST') {
        const rows = (Array.isArray(body) ? body : [body]).map((r) => ({ ...(DEFAULTS[table]?.() || {}), ...r }));
        if (table === 'forms') for (const r of rows) if (t.forms.some((f) => f.slug === r.slug)) return json({ code: '23505', message: 'duplicate key value violates unique constraint "forms_slug_key"' }, 409);
        t[table].push(...rows); return rep ? json(wantObj ? rows[0] : rows, 201) : new Response(null, { status: 201 });
      }
      if (request.method === 'PATCH') {
        const rows = filterRows(t[table], url.searchParams);
        if (table === 'forms' && body.slug && t.forms.some((f) => f.slug === body.slug && !rows.includes(f))) return json({ code: '23505', message: 'duplicate key value violates unique constraint "forms_slug_key"' }, 409);
        rows.forEach((r) => Object.assign(r, body)); return rep ? json(wantObj ? rows[0] : rows) : new Response(null, { status: 204 });
      }
      if (request.method === 'DELETE') {
        const rows = new Set(filterRows(t[table], url.searchParams)); t[table] = t[table].filter((r) => !rows.has(r));
        if (table === 'forms') for (const k of ['form_versions', 'responses', 'page_reach', 'follow_ups', 'identified_responses']) t[k] = t[k].filter((r) => t.forms.some((f) => f.id === r.form_id));
        return new Response(null, { status: 204 });
      }
    }
    return json({ message: 'not found' }, 404);
  };
}
export const DEV_SERVICE_KEY = 'dev-service-key';
