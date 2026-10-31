import { h, a, $, go, mount, setPage, icon, toast } from './ui.js';
import { api, settings } from './api.js';
import { consumeHash, isLoggedIn, onAuth } from './auth.js';
import { cartCount } from './cart.js';
import * as shop from './shop.js';
import * as acc from './account.js';

function layout() {
  const q = h('input', { type: 'search', name: 'q', placeholder: 'Buscar jogos, assinaturas…', 'aria-label': 'Buscar produtos', maxlength: 60, autocomplete: 'off' });
  const count = h('span', { class: 'cart-count', 'aria-hidden': 'true' }); const sr = h('span', { class: 'sr-only' });
  const upd = () => { const n = cartCount(); count.textContent = n || ''; count.hidden = !n; sr.textContent = `${n} item(ns) no carrinho`; if (n) { count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump'); } }; upd(); window.addEventListener('cart', upd);
  const links = [['/produtos', 'Catálogo', 'gamepad'], ['/categoria/jogos-videogames', 'Xbox', 'dice'], ['/categoria/jogos-pc-steam', 'PC / Steam', 'monitor'], ['/categoria/packs-assinaturas', 'Packs e assinaturas', 'gift']];
  const nav = h('nav', { id: 'nav', class: 'nav', 'aria-label': 'Principal' }, links.map(([href, t, ic]) => a(href, {}, icon(ic, { size: 18 }), h('span', {}, t))));
  const acctLabel = h('span', { class: 'lbl' }); const acct = a('/entrar', { class: 'icon-btn', 'aria-label': 'Minha conta' }, icon('user', { size: 22 }), acctLabel);
  const setAcct = () => { acct.href = isLoggedIn() ? '/conta' : '/entrar'; acctLabel.textContent = isLoggedIn() ? 'Minha conta' : 'Entrar'; }; setAcct(); onAuth(setAcct);
  const burger = h('button', { class: 'icon-btn burger', type: 'button', 'aria-label': 'Abrir menu', 'aria-expanded': 'false', 'aria-controls': 'nav', onclick: e => { const o = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(o)); document.body.classList.toggle('nav-open', o); } }, icon('menu', { size: 24 }));
  const ticker = items => h('ul', { class: 'ticker-track' }, items.map(([ic, t]) => h('li', {}, icon(ic, { size: 16 }), t)));
  const tk = [['shield', 'Checkout seguro InfinitePay'], ['shield', 'Entrega automática'], ['lock', 'Instruções liberadas após a confirmação do pagamento'], ['headset', 'Suporte direto no WhatsApp']];
  $('#header').replaceChildren(
    h('div', { class: 'ticker', role: 'region', 'aria-label': 'Avisos da loja' }, ticker(tk), (() => { const d = ticker(tk); d.setAttribute('aria-hidden', 'true'); return d; })()),
    h('div', { class: 'hdr' }, h('div', { class: 'wrap hdr-in' }, burger,
      a('/', { class: 'logo', 'aria-label': 'StoreX Games — início' }, h('img', { src: '/assets/logo.webp', alt: '', width: 44, height: 44 }), h('span', { class: 'logo-txt' }, h('b', {}, 'Store', h('i', {}, 'X')), h('small', {}, 'Games'))),
      nav,
      h('form', { class: 'search', role: 'search', onsubmit: e => { e.preventDefault(); go('/produtos?q=' + encodeURIComponent(q.value.trim())); } }, icon('search', { size: 18 }), q),
      h('div', { class: 'hdr-actions' }, acct, a('/carrinho', { class: 'icon-btn cart-btn', 'aria-label': 'Carrinho' }, icon('cart', { size: 22 }), count, sr)))));
  const bar = h('div', { class: 'progress', 'aria-hidden': 'true' }); document.body.prepend(bar);
  const onScroll = () => { $('#header').classList.toggle('scrolled', scrollY > 24); const m = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${m > 0 ? Math.min(1, scrollY / m) : 0})`; }; addEventListener('scroll', onScroll, { passive: true }); onScroll();
  settings().then(s => {
    const wa = s.whatsapp_number && /^\d{10,15}$/.test(s.whatsapp_number.replace(/\D/g, '')) ? 'https://wa.me/' + s.whatsapp_number.replace(/\D/g, '') : null;
    const col = (t, ...k) => h('div', { class: 'fcol' }, h('h2', {}, t), h('ul', {}, k.map(x => h('li', {}, x))));
    $('#footer').replaceChildren(h('div', { class: 'foot-line', 'aria-hidden': 'true' }), h('div', { class: 'wrap foot' },
      h('div', { class: 'fbrand' }, a('/', { class: 'logo' }, h('img', { src: '/assets/logo.webp', alt: '', width: 56, height: 56, loading: 'lazy' }), h('span', { class: 'logo-txt' }, h('b', {}, 'Store', h('i', {}, 'X')), h('small', {}, 'Games'))), h('p', { class: 'muted' }, s.support_text || 'Jogos, assinaturas e serviços digitais.'),
        wa && h('a', { class: 'btn btn-sm', href: wa, target: '_blank', rel: 'noopener noreferrer' }, icon('whatsapp', { size: 18 }), 'Falar no WhatsApp'), s.instagram_url && /^https:\/\//.test(s.instagram_url) && h('a', { class: 'btn btn-sm btn-ghost', href: s.instagram_url, target: '_blank', rel: 'noopener noreferrer' }, 'Instagram')),
      col('Loja', a('/produtos', {}, 'Catálogo'), a('/categoria/jogos-videogames', {}, 'Xbox'), a('/categoria/jogos-pc-steam', {}, 'PC / Steam'), a('/categoria/packs-assinaturas', {}, 'Packs e assinaturas')),
      col('Minha conta', a('/entrar', {}, 'Entrar ou cadastrar'), a('/conta', {}, 'Meus pedidos'), a('/carrinho', {}, 'Carrinho')),
      col('Institucional', ...[['privacidade', 'Privacidade'], ['termos', 'Termos de compra'], ['entrega', 'Entrega digital'], ['reembolso', 'Cancelamento e reembolso'], ['contato', 'Contato']].map(([s2, t]) => a('/politicas/' + s2, {}, t)))),
      h('div', { class: 'wrap legal' }, h('small', {}, 'Pagamentos processados pela InfinitePay. A StoreX Games não é loja oficial de plataformas, estúdios ou fabricantes; as marcas pertencem aos seus donos.')));
    document.querySelector('.wa-float')?.remove();
    if (wa) document.body.append(h('a', { class: 'wa-float', href: wa, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Falar no WhatsApp' }, icon('whatsapp', { size: 28 })));
  });
}
async function route() {
  document.querySelector('#nav')?.classList.remove('open'); document.body.classList.remove('nav-open'); document.querySelector('.burger')?.setAttribute('aria-expanded', 'false');
  const path = location.pathname.replace(/\/+$/, '') || '/'; let m;
  if (path === '/') return shop.home();
  if (path === '/produtos') return shop.catalog();
  if ((m = path.match(/^\/categoria\/([a-z0-9-]+)$/))) return shop.catalog(m[1]);
  if ((m = path.match(/^\/produto\/([a-z0-9-]+)$/))) return shop.product(m[1]);
  if (path === '/carrinho') return shop.cart();
  if (path === '/entrar') return acc.authPage();
  if (path === '/redefinir-senha') return acc.resetPage();
  if (path === '/conta') return acc.account();
  if ((m = path.match(/^\/pedido\/([A-Z0-9]+)$/))) return acc.orderPage(m[1]);
  if ((m = path.match(/^\/politicas\/([a-z-]+)$/))) return shop.policy(m[1]);
  if (path === '/admin' || path.startsWith('/admin/')) { try { return (await import('./admin.js')).admin(path); } catch { return mount(h('p', { class: 'state err', role: 'alert' }, 'Não foi possível carregar o painel.')); } }
  return shop.notFound();
}
document.addEventListener('click', e => { const l = e.target.closest?.('a[data-link]'); if (!l || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || l.target) return; const u = new URL(l.href, location.href); if (u.origin !== location.origin) return; e.preventDefault(); go(u.pathname + u.search); });
window.addEventListener('popstate', route); window.addEventListener('route', route);
function couponPop() {
  try { if (localStorage.getItem('sx_cp')) return; } catch { /* */ }
  const close = () => { pop.remove(); try { localStorage.setItem('sx_cp', '1'); } catch { /* */ } };
  const pop = h('div', { class: 'cp-pop', role: 'dialog', 'aria-label': 'Cupom de desconto' },
    h('div', {}, h('strong', {}, '10% OFF na primeira compra'), h('small', {}, 'Use o cupom STORE10 no carrinho.')),
    h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText('STORE10'); toast('Cupom STORE10 copiado!'); } catch { toast('Copie o cupom: STORE10', 'err'); } } }, 'Copiar cupom'),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: close }, icon('close', { size: 18 })));
  document.body.append(pop);
}
setTimeout(couponPop, 1500);
const hash = consumeHash(); layout();
if (hash === 'recovery') go('/redefinir-senha', true); else if (hash) { go('/conta', true); } else route();