// Utilitários de interface. Todo conteúdo dinâmico entra por textContent (sem HTML bruto) → sem XSS.
export const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v);
  }
  for (const c of kids.flat(9)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
};
export const money = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtDate = s => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
export const $ = (s, r = document) => r.querySelector(s);
export function mount(node) { const app = $('#app'); app.replaceChildren(node); app.focus({ preventScroll: true }); window.scrollTo(0, 0); observeReveal(app); }
// ---- Revelar ao rolar (respeita prefers-reduced-motion) ----
let io; const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function observeReveal(root = document) {
  const els = [...root.querySelectorAll('.reveal:not(.in)')]; if (!els.length) return;
  if (calm() || !('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
  io ||= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -4% 0px', threshold: 0.01 });
  els.forEach(e => io.observe(e));
}
// ---- Ícones SVG (traço, 24x24). Sem emojis. ----
const P = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z', shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z M9 12l2 2 4-4', headset: 'M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v5H5a1 1 0 0 1-1-1z M20 14h-3v5h2a1 1 0 0 0 1-1z M20 19c0 1.5-2 2-5 2',
  cart: 'M3 4h2l2.4 11h9.7l2-8H6.2 M9 20h.01 M17 20h.01', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.5-6 8-6s8 2 8 6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-4.3-4.3',
  menu: 'M4 7h16M4 12h16M4 17h16', close: 'M6 6l12 12M18 6 6 18', check: 'M5 12l5 5 9-10', gamepad: 'M6 8h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.2 2L15 14H9l-1.8 2A3 3 0 0 1 2 14v-2a4 4 0 0 1 4-4z M7 11v3 M5.5 12.5h3 M16 11.5h.01 M18 13.5h.01',
  monitor: 'M3 5h18v11H3z M8 20h8 M12 16v4', gift: 'M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7C10 7 8 6 8 4.5S11 3 12 7c1-4 4-3.5 4-2.5S14 7 12 7', package: 'M12 3 3 7.5v9L12 21l9-4.5v-9z M3 7.5 12 12l9-4.5 M12 12v9',
  key: 'M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M11 14l9 7 M17 19l2-2', tag: 'M3 12V4h8l10 10-8 8z M7.5 8.5h.01', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2', lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3', right: 'M9 6l6 6-6 6', arrow: 'M5 12h14 M13 6l6 6-6 6', back: 'M19 12H5 M11 6l-6 6 6 6',
  whatsapp: 'M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .7c-1-.4-2-1.4-2.4-2.4l.7-1-1-2z', receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01', plus: 'M12 5v14M5 12h14', refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v4h-4',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z', mail: 'M3 6h18v12H3z M3 7l9 6 9-6', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', eyeoff: 'M3 3l18 18 M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7 M6.4 7.6A17 17 0 0 0 2 12s4 7 10 7a9.8 9.8 0 0 0 4-.9 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  diamond: 'M12 3l8 9-8 9-8-9z', spade: 'M12 3c4 4 8 6 8 10a4 4 0 0 1-7 2.5L14 21h-4l1-5.5A4 4 0 0 1 4 13c0-4 4-6 8-10z', club: 'M12 3a3.5 3.5 0 0 0-3 5.2A3.8 3.8 0 1 0 11 14l-1 7h4l-1-7a3.8 3.8 0 1 0 2.5-5.8A3.5 3.5 0 0 0 12 3z', info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
};
const FILLED = new Set(['diamond', 'spade', 'club']);
export function icon(name, { size = 24, cls = '' } = {}) {
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.setAttribute('class', 'ic ' + cls);
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', P[name] || P.dice);
  if (FILLED.has(name)) p.setAttribute('fill', 'currentColor'); else { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
  s.append(p); return s;
}
export const skeletonGrid = (n = 4) => h('div', { class: 'grid', 'aria-busy': 'true', 'aria-label': 'Carregando' }, Array.from({ length: n }, () => h('div', { class: 'pcard skel' }, h('div', { class: 'skel-img' }), h('div', { class: 'skel-line' }), h('div', { class: 'skel-line s' }))));
export const emptyArt = (title, text, ...actions) => h('div', { class: 'empty-art' }, h('img', { src: '/assets/mascote-terno.webp', alt: '', width: 461, height: 900, loading: 'lazy' }), h('div', {}, h('h2', {}, title), text && h('p', { class: 'muted' }, text), actions.length > 0 && h('div', { class: 'row' }, actions)));
export function setPage(title, { noindex = false, desc } = {}) {
  document.title = title ? `${title} | StoreX Games` : 'StoreX Games — Jogos e produtos digitais';
  let m = $('meta[name=robots]'); if (!m) { m = h('meta', { name: 'robots' }); document.head.append(m); } m.content = noindex ? 'noindex,nofollow' : 'index,follow';
  if (desc) { const d = $('meta[name=description]'); if (d) d.content = desc; }
}
export function toast(msg, kind = 'ok') {
  const t = h('div', { class: 'toast ' + kind, role: kind === 'err' ? 'alert' : 'status' }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), 5000);
}
export const loading = () => h('p', { class: 'state', role: 'status' }, 'Carregando…');
export const errorBox = (msg, retry) => h('div', { class: 'state err', role: 'alert' }, h('p', {}, msg || 'Algo deu errado.'), retry && h('button', { class: 'btn', onclick: retry }, 'Tentar novamente'));
export const empty = msg => h('p', { class: 'state' }, msg);
export function go(path, replace = false) { history[replace ? 'replaceState' : 'pushState']({}, '', path); window.dispatchEvent(new Event('route')); }
export const a = (href, attrs, ...k) => h('a', { href, 'data-link': '', ...attrs }, ...k);
// Evita redirecionamento aberto: só caminhos internos simples.
export const safeNext = p => (typeof p === 'string' && /^\/(?![/\\])[\w\-/?=&%.]*$/.test(p) ? p : '/conta');
export const STATUS = { pending: 'Aguardando pagamento', paid: 'Pago', in_delivery: 'Em atendimento', completed: 'Concluído', cancelled: 'Cancelado', expired: 'Expirado', refunded: 'Estornado', failed: 'Falhou', delivered: 'Entregue', needs_review: 'Revisar entrega' };
export const badge = s => h('span', { class: 'badge b-' + s }, STATUS[s] || s);
export function field(label, input, hint) { const id = 'f' + Math.random().toString(36).slice(2, 8); input.id = id; return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint && h('small', {}, hint)); }
export const imgOrPlaceholder = (url, alt, cls = 'thumb') => url ? h('img', { src: url, alt, class: cls, loading: 'lazy', decoding: 'async' }) : h('div', { class: cls + ' ph', role: 'img', 'aria-label': 'Sem imagem' }, icon('gamepad', { size: 40 }));
