// Small UI helpers shared by the admin views.
import { h } from '/forms/render.js';
export { h };

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}

// Modal built on <dialog>: focus trap and Escape come for free.
export function modal(title, body, buttons) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-t' }, h('h2', { id: 'dlg-t', text: title }), body,
      h('div', { class: 'row' }, buttons.map((b) => h('button', { type: 'button', class: 'btn ' + (b.cls || 'ghost'), onClick: () => { dlg.close(); resolve(b.value); }, text: b.label }))));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(null); });
    document.body.append(dlg); dlg.showModal();
  });
}
export const confirmBox = (title, text, ok = 'Delete', cls = 'danger') => modal(title, h('p', { text }), [{ label: 'Cancel', value: false }, { label: ok, value: true, cls }]).then(Boolean);

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed: select and copy manually'); }
}
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; return d; };
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
