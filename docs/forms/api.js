// Browser client for the ingest Worker. Same-origin (cc.braunf.com/api/*): no third parties,
// no cookies, no custom headers that identify the visitor.
async function call(path, body) {
  const res = await fetch('/api' + path, { method: body ? 'POST' : 'GET', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}
export const publicApi = (slug) => ({
  form: () => call(`/f/${slug}`),
  challenge: async () => { const r = await call('/challenge'); if (!r.token) throw new Error('challenge'); return r; },
  submit: (payload) => call(`/f/${slug}/submit`, payload),
  followUp: (payload) => call(`/f/${slug}/follow-up`, payload),
  reach: (page) => call(`/f/${slug}/reach`, { version: window.__ccVersion, page }),
  deleteWithToken: (token) => call('/delete', { token }),
});
