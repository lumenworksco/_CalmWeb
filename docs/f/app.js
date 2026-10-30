// Public form page: /f/<slug> (the Worker serves this shell for any slug; ?s=<slug> also works).
import { mountForm, mountDelete, h } from '../forms/render.js';
import { publicApi } from '../forms/api.js';

const root = document.getElementById('app');
const slug = (location.pathname.match(/^\/f\/([a-z0-9-]+)\/?$/) || [])[1] || new URLSearchParams(location.search).get('s') || '';

function message(title, text) {
  root.classList.add('cc-form');
  root.replaceChildren(h('div', { class: 'cc-top' }, h('img', { src: '/assets/brand/first-sprout-horizontal-color.svg', alt: 'CalmCampus', width: 222, height: 34 })),
    h('section', { class: 'cc-screen' }, h('h1', { text: title }), h('p', { class: 'cc-lead', text: text }),
      h('p', {}, h('a', { href: '/', text: 'About CalmCampus' }))));
}

if (!slug) {
  mountDelete(root, publicApi(''));
} else {
  const api = publicApi(slug);
  api.form().then((form) => {
    if (form.error || !form.doc) return message('We can’t find that form', 'The link may be mistyped, or the form may have been taken down.');
    document.title = `${form.title} · CalmCampus`;
    if (form.settings?.accent === 'sage') document.documentElement.dataset.accent = 'sage';
    window.__ccVersion = form.version;
    if (!form.open) return message('This form is closed', 'It isn’t taking answers right now. Thank you for stopping by.');
    mountForm(root, form, { api });
  }).catch(() => message('Something went wrong', 'We couldn’t load the form. Please check your connection and try again.'));
}
