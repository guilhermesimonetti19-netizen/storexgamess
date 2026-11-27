import { h, money, toast } from './ui.js';
const NS = 'http://www.w3.org/2000/svg';
const el = (t, at = {}, ...k) => { const e = document.createElementNS(NS, t); for (const [x, v] of Object.entries(at)) e.setAttribute(x, v); e.append(...k.filter(Boolean)); return e; };
function bars(title, data, fmt) {
  const max = Math.max(1, ...data.map(d => d.v)), W = 640, H = 160, step = (W - 20) / data.length, bw = Math.max(4, step - 4);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H + 22}`, role: 'img', 'aria-label': title, class: 'chart' }, el('title', {}, title),
    ...data.map((d, i) => { const ht = d.v ? Math.max(2, d.v / max * H) : 0; return el('rect', { x: 10 + i * step, y: H - ht, width: bw, height: ht, rx: 2 }, el('title', {}, `${d.l.slice(5)}: ${fmt(d.v)}`)); }),
    ...data.map((d, i) => i % 5 === 0 && el('text', { x: 10 + i * step + bw / 2, y: H + 15, 'text-anchor': 'middle' }, d.l.slice(5))));
  return h('figure', { class: 'card chart-card' }, h('figcaption', {}, title), h('div', { class: 'chart-scroll' }, svg));
}
const k = (l, v) => h('div', { class: 'kpi' }, h('span', {}, l), h('strong', {}, v));
export function affiliatePanel(a) {
  return h('section', { class: 'card' }, h('h2', {}, 'Programa de afiliados'),
    !a.active && h('p', { class: 'note' }, 'Seu link está desativado no momento.'),
    h('p', {}, 'Seu link: ', h('strong', {}, a.link)),
    h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(a.link); toast('Link copiado!'); } catch { toast('Copie o link: ' + a.link, 'err'); } } }, 'Copiar link')),
    h('p', { class: 'note' }, `Você ganha ${a.percent}% por venda confirmada pelo seu link.`),
    h('div', { class: 'kpis' }, k('Ganhos no mês', money(a.month_commission_cents)), k('Ganhos totais', money(a.commission_cents)), k('Vendas pelo seu link', String(a.sales))),
    h('div', { class: 'charts' },
      bars('Ganhos por dia, últimos 30 dias (R$)', a.series.map(x => ({ l: x.d, v: x.cents / 100 })), v => money(Math.round(v * 100))),
      bars('Vendas por dia, últimos 30 dias', a.series.map(x => ({ l: x.d, v: x.sales })), String)));
}