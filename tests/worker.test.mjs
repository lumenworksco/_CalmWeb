import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { makeChallenge } from '../worker/src/index.js';
import { solve } from '../docs/forms/pow.js';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_test', CHALLENGE_SECRET: 's3cret', MIN_FILL_MS: '0' };
const doc = { pages: [{ id: 'p1', blocks: [{ id: 'q1', type: 'single_choice', label: 'Q', required: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] }] };
const form = { slug: 'demo', title: 'Demo', version: 1, privacy_mode: 'anonymous', doc, settings: { thanks: 'Thanks', secret_internal: 'no' }, open: true };

function mockSupabase(overrides = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const fn = String(url).split('/rpc/')[1];
    const args = JSON.parse(init.body);
    calls.push({ fn, args, init });
    const out = { get_public_form: form, submit_response: true, submit_follow_up: true, track_page: null, ...overrides }[fn];
    return new Response(JSON.stringify(out), { status: 200 });
  };
  return calls;
}
const post = (path, body) => new Request(`https://cc.braunf.com${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'UA-secret' } });
async function pow() { const { token, bits } = await makeChallenge(env, Date.now() - 10_000); return { token, pow: await solve(token, bits) }; }

test('public form hides internal settings', async () => {
  mockSupabase();
  const res = await worker.fetch(new Request('https://cc.braunf.com/api/f/demo'), env);
  const body = await res.json();
  assert.equal(body.settings.thanks, 'Thanks');
  assert.equal(body.settings.secret_internal, undefined);
});

test('valid anonymous submission stores only the cleaned answers', async () => {
  const calls = mockSupabase();
  const res = await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'a', junk: 'x' }, ...(await pow()) }), env);
  assert.equal((await res.json()).ok, true);
  const store = calls.find((c) => c.fn === 'submit_response');
  assert.deepEqual(store.args, { p_slug: 'demo', p_answers: { q1: 'a' } });
  // nothing identifying reaches Supabase: no IP, no user agent, no forwarded headers
  const sent = JSON.stringify([store.init.headers, store.args]);
  assert.ok(!sent.includes('203.0.113.9') && !sent.includes('UA-secret'));
});

test('invalid answers are rejected before reaching the database', async () => {
  const calls = mockSupabase();
  const res = await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'nope' }, ...(await pow()) }), env);
  assert.equal(res.status, 422);
  assert.ok(!calls.some((c) => c.fn === 'submit_response'));
});

test('missing/forged challenge, reused challenge and too-fast submissions are rejected', async () => {
  mockSupabase();
  assert.equal((await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'a' } }), env)).status, 400);
  assert.equal((await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'a' }, token: 'a.b', pow: 1 }), env)).status, 400);
  const p = await pow();
  assert.equal((await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'a' }, ...p }), env)).status, 200);
  assert.equal((await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'a' }, ...p }), env)).status, 400);
  const fast = await makeChallenge(env, Date.now());
  const strict = { ...env, MIN_FILL_MS: '4000' };
  assert.equal((await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'a' }, token: fast.token, pow: await solve(fast.token, fast.bits) }), strict)).status, 400);
});

test('honeypot gets a fake success and stores nothing', async () => {
  const calls = mockSupabase();
  const res = await worker.fetch(post('/api/f/demo/submit', { website: 'http://spam', answers: {} }), env);
  assert.equal((await res.json()).ok, true);
  assert.equal(calls.length, 0);
});

test('closed form returns 410', async () => {
  mockSupabase({ get_public_form: { ...form, open: false } });
  const res = await worker.fetch(post('/api/f/demo/submit', { answers: { q1: 'a' }, ...(await pow()) }), env);
  assert.equal(res.status, 410);
});

test('follow-up is a separate call that carries no answers', async () => {
  const calls = mockSupabase();
  const res = await worker.fetch(post('/api/f/demo/follow-up', { contact: 'me@uni.be', ...(await pow()) }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map((c) => c.fn), ['submit_follow_up']);
  assert.deepEqual(calls[0].args, { p_slug: 'demo', p_contact: 'me@uni.be' });
});

test('identified form needs consent and returns a delete token (only its hash is stored)', async () => {
  const calls = mockSupabase({ get_public_form: { ...form, privacy_mode: 'identified' }, submit_identified: true });
  const base = { answers: { q1: 'a' }, contact: { email: 'a@b.eu' } };
  assert.equal((await worker.fetch(post('/api/f/demo/submit', { ...base, ...(await pow()) }), env)).status, 400);
  const res = await worker.fetch(post('/api/f/demo/submit', { ...base, consent: true, ...(await pow()) }), env);
  const { deleteToken } = await res.json();
  const stored = calls.find((c) => c.fn === 'submit_identified').args;
  assert.ok(deleteToken.length > 20 && stored.p_token_hash && stored.p_token_hash !== deleteToken);
});

test('routing: /f/<slug> serves the form shell, /f/app.js and /f/ pass through untouched', async () => {
  const seen = [];
  globalThis.fetch = async (u) => { const url = String(u.url || u); seen.push(url); return new Response('<html>shell</html>', { status: 200, headers: { 'content-type': 'text/html' } }); };
  const shell = await worker.fetch(new Request('https://cc.braunf.com/f/my-form'), env);
  assert.match(seen.at(-1), /\/f\/index\.html$/);
  assert.equal(shell.headers.get('x-robots-tag'), 'noindex');
  await worker.fetch(new Request('https://cc.braunf.com/f/app.js'), env);
  assert.match(seen.at(-1), /\/f\/app\.js$/);
  await worker.fetch(new Request('https://cc.braunf.com/f/'), env);
  assert.match(seen.at(-1), /\/f\/$/);
});

test('scheduled job purges expired data and reshuffles anonymous tables', async () => {
  const calls = mockSupabase({ purge_expired: 0, reshuffle_anonymous: null });
  await worker.scheduled({}, env);
  assert.deepEqual(calls.map((c) => c.fn), ['purge_expired', 'reshuffle_anonymous']);
});
