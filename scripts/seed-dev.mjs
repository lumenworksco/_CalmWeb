#!/usr/bin/env node
// Seeds a running dev server (scripts/dev-server.mjs) with a published form from each template.
//   node scripts/seed-dev.mjs [http://localhost:3400]
import { TEMPLATES } from '../docs/forms/templates.js';
const base = process.argv[2] || 'http://localhost:3400';
const H = { 'content-type': 'application/json', authorization: 'Bearer dev-admin-token', apikey: 'dev', prefer: 'return=representation' };
for (const t of TEMPLATES) {
  const r = await fetch(`${base}/supabase/rest/v1/forms`, { method: 'POST', headers: H, body: JSON.stringify({ slug: t.id, title: t.title, privacy_mode: t.privacy_mode, draft: t.doc, settings: t.settings }) });
  const [form] = await r.json();
  await fetch(`${base}/supabase/rest/v1/rpc/publish_form`, { method: 'POST', headers: H, body: JSON.stringify({ p_form_id: form.id }) });
  console.log(`seeded ${base}/f/${t.id}`);
}
