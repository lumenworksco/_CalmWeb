// CalmWeb ingest Worker (cc.braunf.com/api/* and /f/*).
//
// Why this exists: respondents must never call Supabase directly, because Supabase's API logs
// would record their IP. They call this Worker, and the Worker talks to Supabase with the
// service key. Nothing here logs, stores or forwards visitor IPs, user agents or headers.
//
// Spam: stateless HMAC-signed challenge + proof-of-work + minimum fill time + honeypot +
// optional edge rate limiting. No third-party CAPTCHA, no identifier stored with answers.

import { validateSubmission } from '../../docs/forms/core.js';
import { check as checkPow } from '../../docs/forms/pow.js';

const enc = new TextEncoder();
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(secret, data) { return b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))); }

const POW_BITS = 16;       // ~65k hashes: a fraction of a second on a phone
const TOKEN_TTL_MS = 30 * 60 * 1000;
const MIN_FILL_MS = 4000;  // anything faster than this is not a person reading a form

export async function makeChallenge(env, now = Date.now()) {
  const payload = b64u(enc.encode(JSON.stringify({ iat: now, exp: now + TOKEN_TTL_MS, n: crypto.randomUUID() })));
  return { token: `${payload}.${await sign(env.CHALLENGE_SECRET, payload)}`, bits: POW_BITS };
}

// In-isolate replay guard (best effort). It holds token nonces only, never answers or visitors.
const spent = new Map();
export async function verifyChallenge(env, token, counter, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [payload, mac] = token.split('.');
  if (!payload || !mac || (await sign(env.CHALLENGE_SECRET, payload)) !== mac) return false;
  let p; try { p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch { return false; }
  if (now > p.exp || now - p.iat < Number(env.MIN_FILL_MS ?? MIN_FILL_MS) || spent.has(p.n)) return false;
  if (!(await checkPow(token, counter, POW_BITS))) return false;
  for (const [k, exp] of spent) if (exp < now) spent.delete(k);
  spent.set(p.n, p.exp);
  return true;
}

async function rpc(env, fn, args) {
  const key = env.SUPABASE_SERVICE_KEY;
  const headers = { 'content-type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const publicForm = (f) => ({ slug: f.slug, title: f.title, version: f.version, privacy_mode: f.privacy_mode, doc: f.doc, settings: publicSettings(f.settings), open: f.open });
// Settings the respondent needs; never leak internal fields.
const publicSettings = (s = {}) => ({ intro: s.intro, thanks: s.thanks, redirect: s.redirect, consent: s.consent, retention_days: s.retention_days, follow_up: s.follow_up, view: s.view, accent: s.accent, cover: s.cover, one_per_device: s.one_per_device, contact_email: s.contact_email, wellbeing: s.wellbeing, crisis: s.crisis, who: s.who, purpose: s.purpose, contact_fields: s.contact_fields, retention_text: s.retention_text });

async function readJson(request, max = 100_000) {
  const text = await request.text();
  if (text.length > max) throw Object.assign(new Error('too large'), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

async function limited(env, request) {
  // Optional Cloudflare rate-limit binding, keyed on the connecting IP at the edge. The key lives
  // in edge memory for the window and is never written next to any answer.
  if (!env.RATE_LIMIT) return false;
  const { success } = await env.RATE_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'x' });
  return !success;
}

export async function handleApi(request, env, url) {
  const parts = url.pathname.replace(/^\/api\//, '').split('/');
  const method = request.method;

  if (parts[0] === 'challenge' && method === 'GET') return json(await makeChallenge(env));

  if (parts[0] === 'delete' && method === 'POST') {
    const { token } = await readJson(request);
    if (typeof token !== 'string' || token.length < 20) return json({ ok: false }, 400);
    const hash = hex(await crypto.subtle.digest('SHA-256', enc.encode(token)));
    return json({ ok: await rpc(env, 'delete_identified', { p_token_hash: hash }) });
  }

  if (parts[0] !== 'f' || !SLUG.test(parts[1] || '')) return json({ error: 'not found' }, 404);
  const slug = parts[1], action = parts[2];

  if (!action && method === 'GET') {
    const form = await rpc(env, 'get_public_form', { p_slug: slug });
    return form ? json(publicForm(form), 200, { 'cache-control': 'public, max-age=20' }) : json({ error: 'not found' }, 404);
  }

  if (action === 'reach' && method === 'POST') {
    const { version, page } = await readJson(request, 1000);
    if (Number.isInteger(version) && typeof page === 'string') await rpc(env, 'track_page', { p_slug: slug, p_version: version, p_page_id: page });
    return json({ ok: true });
  }

  if ((action === 'submit' || action === 'follow-up') && method === 'POST') {
    if (await limited(env, request)) return json({ error: 'slow down' }, 429);
    const body = await readJson(request);
    if (body.website) return json({ ok: true });                         // honeypot: pretend success
    if (!(await verifyChallenge(env, body.token, body.pow))) return json({ error: 'challenge' }, 400);

    if (action === 'follow-up') {
      const c = typeof body.contact === 'string' ? body.contact.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) || c.length > 320) return json({ error: 'invalid' }, 400);
      return json({ ok: await rpc(env, 'submit_follow_up', { p_slug: slug, p_contact: c }) });
    }

    const form = await rpc(env, 'get_public_form', { p_slug: slug });
    if (!form || !form.open) return json({ error: 'closed' }, 410);
    const { ok, errors, clean } = validateSubmission(form.doc, body.answers);
    if (!ok) return json({ error: 'invalid', errors }, 422);

    if (form.privacy_mode === 'identified') {
      const contact = body.contact || {};
      if (body.consent !== true) return json({ error: 'consent' }, 400);
      const cleanContact = {};
      for (const k of ['name', 'email']) if (typeof contact[k] === 'string' && contact[k].trim()) cleanContact[k] = contact[k].trim().slice(0, 320);
      if (!cleanContact.email) return json({ error: 'invalid', errors: { email: 'required' } }, 422);
      const deleteToken = b64u(crypto.getRandomValues(new Uint8Array(24)));
      const hash = hex(await crypto.subtle.digest('SHA-256', enc.encode(deleteToken)));
      const stored = await rpc(env, 'submit_identified', { p_slug: slug, p_answers: clean, p_contact: cleanContact, p_token_hash: hash });
      return stored ? json({ ok: true, deleteToken }) : json({ error: 'closed' }, 410);
    }
    const stored = await rpc(env, 'submit_response', { p_slug: slug, p_answers: clean });
    return stored ? json({ ok: true }) : json({ error: 'closed' }, 410);
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
    } catch (e) {
      // Deliberately no logging of requests; only a generic failure goes back.
      return json({ error: e.status ? e.message : 'server error' }, e.status || 500);
    }
    // /f/<slug> serves the static form shell; everything else passes through to the site.
    const target = env.ORIGIN ? new URL(url.pathname + url.search, env.ORIGIN) : null;
    if (/^\/f\/[a-z0-9]+(-[a-z0-9]+)*\/?$/.test(url.pathname)) {
      const shell = target ? new URL('/f/index.html', target) : new URL('/f/index.html', url);
      const res = await fetch(shell.toString());
      return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
    }
    return target ? fetch(target.toString(), request) : fetch(request);
  },

  // Daily: delete identified responses past their retention date.
  async scheduled(_event, env) { await rpc(env, 'purge_expired', {}); },
};
