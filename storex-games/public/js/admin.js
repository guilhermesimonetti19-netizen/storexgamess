import { h, a, icon, money, fmtDate, mount, setPage, loading, errorBox, empty, toast, go, field, badge, STATUS, $ } from './ui.js';
import { api } from './api.js';
import { isLoggedIn } from './auth.js';
import { FAQ, STEPS } from './shop.js';

const NAV = [['/admin', 'Dashboard', 'bolt'], ['/admin/analytics', 'Analytics', 'eye'], ['/admin/produtos', 'Produtos', 'package'], ['/admin/mais-vendidos', 'Mais vendidos', 'star'], ['/admin/pedidos', 'Pedidos', 'receipt'], ['/admin/relatorios', 'Relatórios', 'tag'], ['/admin/cupons', 'Cupons', 'tag'], ['/admin/configuracoes', 'Configurações', 'key'], ['/admin/auditoria', 'Auditoria', 'clock']];
const shell = (path, ...content) => mount(h('div', { class: 'wrap page admin' }, h('nav', { class: 'admin-nav', 'aria-label': 'Administração' }, NAV.map(([p, t, ic]) => a(p, { 'aria-current': (p === '/admin' ? path === p : path.startsWith(p)) ? 'page' : null }, icon(ic, { size: 18 }), t))), h('section', { class: 'admin-main' }, content)));
const tbl = (cols, rows) => rows.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', { scope: 'col' }, c)))), h('tbody', {}, rows))) : empty('Nenhum registro.');
const pager = (r, fn) => h('nav', { class: 'pager' }, r.page > 1 && h('button', { class: 'btn', onclick: () => fn(r.page - 1) }, '←'), h('span', {}, `Página ${r.page} • ${r.total} registro(s)`), r.page * (r.pageSize || 20) < r.total && h('button', { class: 'btn', onclick: () => fn(r.page + 1) }, '→'));
const pct = (c, p) => p > 0 ? h('span', { class: c >= p ? 'up' : 'down' }, `${c >= p ? '+' : '-'}${Math.abs(Math.round((c - p) / p * 100))}% vs. período anterior`) : 'Sem dados anteriores';
const spDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); // YYYY-MM-DD
const spStart = ds => new Date(ds + 'T00:00:00-03:00'); // Brasil sem horário de verão

export async function admin(path) {
  setPage('Admin', { noindex: true }); if (!isLoggedIn()) return go('/entrar?next=' + encodeURIComponent(path), true); mount(loading());
  try { const me = await api('/api/me'); if (!me.isAdmin) return mount(h('div', { class: 'state err', role: 'alert' }, h('h1', {}, 'Acesso negado'), h('p', {}, 'Esta área é restrita ao administrador.'), a('/', { class: 'btn' }, 'Voltar'))); } catch (e) { return mount(errorBox(e.message, () => admin(path))); }
  let m;
  if (path === '/admin') return dashboard(path);
  if (path === '/admin/analytics') return analyticsPage(path);
  if (path === '/admin/produtos') return products(path);
  if (path === '/admin/produtos/novo') return productForm(path, null);
  if ((m = path.match(/^\/admin\/produtos\/([0-9a-f-]{36})$/))) return productForm(path, m[1]);
  if (path === '/admin/mais-vendidos') return bestsellersPage(path);
  if (path === '/admin/pedidos') return orders(path);
  if ((m = path.match(/^\/admin\/pedidos\/([0-9a-f-]{36})$/))) return orderDetail(path, m[1]);
  if (path === '/admin/relatorios') return reports(path);
  if (path === '/admin/cupons') return couponsPage(path);
  if (path === '/admin/configuracoes') return settingsPage(path);
  if (path === '/admin/auditoria') return auditPage(path);
  mount(h('p', { class: 'state' }, 'Página administrativa não encontrada.'));
}

// ---------- Gráficos (SVG acessível, sem bibliotecas) ----------
const NS = 'http://www.w3.org/2000/svg'; let _g = 0;
const el = (t, at = {}, ...k) => { const e = document.createElementNS(NS, t); for (const [x, v] of Object.entries(at)) e.setAttribute(x, v); e.append(...k.filter(Boolean)); return e; };
function bars(title, data, fmt = String) {
  const max = Math.max(1, ...data.map(d => d.v)); const W = Math.max(320, data.length * 36), H = 160, bw = Math.min(28, (W - 20) / Math.max(1, data.length) - 6); const ns = NS;
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H + 22}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', title); svg.setAttribute('class', 'chart');
  const t = document.createElementNS(ns, 'title'); t.textContent = title; svg.append(t);
  data.forEach((d, i) => { const x = 10 + i * ((W - 20) / data.length), ht = Math.max(2, d.v / max * H); const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', x); r.setAttribute('y', H - ht); r.setAttribute('width', bw); r.setAttribute('height', ht); r.setAttribute('rx', 3); const tt = document.createElementNS(ns, 'title'); tt.textContent = `${d.l}: ${fmt(d.v)}`; r.append(tt); svg.append(r);
    if (data.length <= 16 || i % Math.ceil(data.length / 12) === 0) { const tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', x + bw / 2); tx.setAttribute('y', H + 15); tx.setAttribute('text-anchor', 'middle'); tx.textContent = d.l.slice(5); svg.append(tx); } });
  return h('figure', { class: 'card chart-card' }, h('figcaption', {}, title), data.length ? h('div', { class: 'chart-scroll' }, svg) : empty('Sem dados no período.'),
    data.length > 0 && h('details', {}, h('summary', {}, 'Ver em tabela'), tbl(['Item', 'Valor'], data.map(d => h('tr', {}, h('td', {}, d.l), h('td', {}, fmt(d.v)))))));
}
const hbars = (title, data, fmt) => h('figure', { class: 'card chart-card' }, h('figcaption', {}, title), data.length ? h('ul', { class: 'hbars' }, data.map(d => h('li', {}, h('span', {}, d.l), h('span', { class: 'hb', role: 'img', 'aria-label': `${d.l}: ${fmt(d.v)}` }, h('i', { style: `width:${Math.max(3, d.v / Math.max(1, ...data.map(x => x.v)) * 100)}%` })), h('b', {}, fmt(d.v))))) : empty('Sem dados no período.'));
function lineChart(title, data, fmt = String) {
  const n = data.length, W = 640, H = 210, L = 10, B = 24, T = 12, max = Math.max(1, ...data.map(d => d.v)), gid = 'lg' + ++_g;
  const X = i => L + (n < 2 ? (W - 2 * L) / 2 : i * (W - 2 * L) / (n - 1)), Y = v => T + (H - T - B) * (1 - v / max);
  let svg = null;
  if (n) {
    const pts = data.map((d, i) => [X(i), Y(d.v)]), line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title, class: 'chart' }, el('title', {}, title),
      el('defs', {}, el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, el('stop', { offset: '0', 'stop-color': '#2bff88', 'stop-opacity': '.4' }), el('stop', { offset: '1', 'stop-color': '#8b5cf6', 'stop-opacity': '0' }))),
      ...[0, .5, 1].map(f => el('line', { class: 'lc-grid', x1: L, x2: W - L, y1: Y(max * f), y2: Y(max * f) })),
      el('path', { d: `${line} L${pts[n - 1][0]} ${H - B} L${pts[0][0]} ${H - B} Z`, fill: `url(#${gid})` }),
      el('path', { class: 'lc-line', d: line }),
      ...pts.map((p, i) => el('circle', { class: 'lc-dot', cx: p[0], cy: p[1], r: 3.5 }, el('title', {}, `${data[i].l}: ${fmt(data[i].v)}`))),
      ...data.map((d, i) => (n <= 8 || i % Math.ceil(n / 8) === 0) && el('text', { x: X(i), y: H - 6, 'text-anchor': 'middle' }, d.l.slice(5))).filter(Boolean));
  }
  return h('figure', { class: 'card chart-card wide' }, h('figcaption', {}, title), svg ? h('div', { class: 'chart-scroll' }, svg) : empty('Sem dados no período.'));
}
function donut(title, data) {
  const tot = data.reduce((s, d) => s + d.v, 0), R = 46, C = 2 * Math.PI * R; let off = 0;
  const svg = el('svg', { viewBox: '0 0 120 120', role: 'img', 'aria-label': title, class: 'dn' }, el('title', {}, title),
    ...data.map(d => { const len = d.v / tot * C, c = el('circle', { class: 's-' + d.k, cx: 60, cy: 60, r: R, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 60 60)' }, el('title', {}, `${d.l}: ${d.v}`)); off += len; return c; }),
    el('text', { x: 60, y: 66, 'text-anchor': 'middle', class: 'dn-n' }, String(tot)));
  return h('figure', { class: 'card chart-card' }, h('figcaption', {}, title), tot ? h('div', { class: 'dn-wrap' }, svg, h('ul', { class: 'dn-leg' }, data.map(d => h('li', { class: 's-' + d.k }, h('i', { class: 'dot' }), `${d.l}: ${d.v}`)))) : empty('Sem dados no período.'));
}
const kpi = (label, value, sub, ic, main) => h('div', { class: 'kpi' + (main ? ' main' : '') }, ic && h('span', { class: 'k-ic' }, icon(ic, { size: 20 })), h('span', {}, label), h('strong', {}, value), sub && h('small', {}, sub));

async function dashboard(path) {
  let preset = '30d', from, to; const body = h('div', { 'aria-live': 'polite' }, loading());
  const range = () => { const today = spDay(), end = new Date(); let f; if (preset === 'today') f = spStart(today); else if (preset === '7d') f = new Date(end - 7 * 864e5); else if (preset === '30d') f = new Date(end - 30 * 864e5); else if (preset === 'month') f = spStart(today.slice(0, 8) + '01'); else return { from: spStart(from.value).toISOString(), to: new Date(spStart(to.value).getTime() + 864e5).toISOString() }; return { from: f.toISOString(), to: end.toISOString() }; };
  from = h('input', { type: 'date', value: spDay(new Date(Date.now() - 30 * 864e5)) }); to = h('input', { type: 'date', value: spDay() });
  const btns = [['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['month', 'Mês atual'], ['custom', 'Personalizado']].map(([k, t]) => h('button', { class: 'btn' + (k === preset ? ' btn-primary' : ''), type: 'button', 'data-k': k, onclick: () => { preset = k; btns.forEach(b => b.classList.toggle('btn-primary', b.dataset.k === k)); custom.hidden = k !== 'custom'; if (k !== 'custom') load(); } }, t));
  const custom = h('span', { hidden: true }, h('label', {}, 'De ', from), h('label', {}, ' até ', to), h('button', { class: 'btn', onclick: () => load() }, 'Aplicar'));
  const stamp = h('small', { class: 'muted' });
  async function load() {
    body.replaceChildren(loading());
    try {
      const r = range(); const days = (Date.parse(r.to) - Date.parse(r.from)) / 864e5; const bucket = days > 120 ? 'month' : days > 45 ? 'week' : 'day';
      const d = await api(`/api/admin/dashboard?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}&bucket=${bucket}`); const k = d.kpis, at = d.attention, p = d.products, c = d.customers;
      stamp.textContent = 'Atualizado em ' + fmtDate(d.generated_at); const cnt = s => d.orders_by_status.find(x => x.status === s)?.count || 0; const total = d.orders_by_status.reduce((s, x) => s + x.count, 0);
      const ticket = k.paid_orders ? Math.round(k.gross_cents / k.paid_orders) : null;
      const alert = (n, t, href) => n > 0 ? h('li', {}, a(href, {}, h('strong', {}, n), ' ', t)) : null;
      const alerts = [alert(at.pending_old, 'pedido(s) aguardando pagamento há muito tempo', '/admin/pedidos?stale=1'), alert(at.paid_undelivered, 'pago(s) aguardando entrega manual', '/admin/pedidos?payment_status=paid&delivery_status=pending'), alert(at.needs_whatsapp, 'cliente(s) já abriram o WhatsApp e aguardam entrega', '/admin/pedidos?whatsapp=1'), alert(at.needs_review, 'pedido(s) com entrega para revisar (estorno)', '/admin/pedidos?delivery_status=needs_review'), alert(at.payment_errors_7d, 'falha(s)/rejeição(ões) de pagamento nos últimos 7 dias', '/admin/pedidos'), alert(p.no_image, 'produto(s) ativo(s) sem imagem', '/admin/produtos'), alert(p.low_stock, 'produto(s) com estoque baixo', '/admin/produtos'), alert(p.out_of_stock, 'produto(s) esgotado(s)', '/admin/produtos')].filter(Boolean);
      const R = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      body.replaceChildren(
        h('div', { class: 'kpis' },
          kpi('Faturamento bruto', money(k.gross_cents), pct(k.gross_cents, k.gross_prev_cents), 'tag', 1),
          kpi('Pedidos pagos', String(k.paid_orders), pct(k.paid_orders, k.paid_orders_prev), 'receipt', 1),
          kpi('Ticket médio', ticket === null ? '—' : money(ticket), 'Faturamento ÷ pedidos pagos', 'star', 1),
          kpi('Aguardando pagamento', String(cnt('pending')), `${at.pending_old} há muito tempo`, 'clock', 1)),
        h('div', { class: 'kpis' },
          kpi('Custo (pedidos com custo)', money(d.profit.cost_cents), d.profit.missing_cost ? `${d.profit.missing_cost} pedido(s) sem custo informado` : 'Todos com custo', 'package', 1),
          kpi('Lucro', money(d.profit.profit_cents), 'Faturamento − custo', 'star', 1),
          kpi('Margem', d.profit.revenue_cents ? Math.round(d.profit.profit_cents / d.profit.revenue_cents * 100) + '%' : '—', 'Lucro ÷ faturamento', 'tag', 1)),
        h('div', { class: 'charts' },
          lineChart('Faturamento por ' + ({ day: 'dia', week: 'semana', month: 'mês' })[bucket] + ' (R$)', d.revenue_series.map(x => ({ l: x.d, v: x.cents / 100 })), R),
          lineChart('Lucro por ' + ({ day: 'dia', week: 'semana', month: 'mês' })[bucket] + ' (R$)', d.profit.series.map(x => ({ l: x.d, v: x.cents / 100 })), R),
          donut('Pedidos por status', d.orders_by_status.map(x => ({ k: x.status, l: STATUS[x.status] || x.status, v: x.count }))),
          hbars('Vendas por categoria (R$)', d.by_category.map(x => ({ l: x.category, v: x.cents / 100 })), R),
          bars('Novos clientes', d.customers_series.map(x => ({ l: x.d, v: x.n })))),
        h('div', { class: 'kpis sm' },
          kpi('Pedidos criados', String(k.orders_created), pct(k.orders_created, k.orders_created_prev)), kpi('Estornos', money(k.refunded_cents), `${k.refunded_orders} pedido(s)`),
          kpi('Vendas hoje', money(k.sales_today_cents)), kpi('7 / 30 dias', `${money(k.sales_7d_cents)} / ${money(k.sales_30d_cents)}`),
          kpi('Clientes', String(c.total), `${c.new} novo(s) • ${c.buyers} já compraram`), kpi('Produtos', `${p.active} ativos`, `${p.inactive} inativos • ${p.featured} em destaque`),
          kpi('Atendimento / concluídos', `${cnt('in_delivery')} / ${cnt('completed')}`, `Cancelados ${cnt('cancelled')} • Expirados ${cnt('expired')}`), kpi('Valor líquido', 'indisponível', d.net_note)),
        h('div', { class: 'two' },
          h('section', { class: 'card attention' }, h('h2', {}, 'Precisa de atenção'), alerts.length ? h('ul', {}, alerts) : empty('Nada pendente.')),
          h('section', {}, h('h2', {}, 'Mais vendidos'), tbl(['Produto', 'Qtd', 'Faturamento'], d.top_products.map(t => h('tr', {}, h('td', {}, t.name), h('td', {}, t.qty), h('td', {}, money(t.cents))))))),
        h('section', {}, h('h2', {}, 'Pedidos recentes'), tbl(['Pedido', 'Data', 'Total', 'Pagamento', 'Entrega', ''], d.recent_orders.map(o => h('tr', {}, h('td', {}, o.public_ref), h('td', {}, fmtDate(o.created_at)), h('td', {}, money(o.total_cents)), h('td', {}, badge(o.payment_status)), h('td', {}, badge(o.delivery_status)), h('td', {}, a('/admin/pedidos/' + o.id, { class: 'btn' }, 'Abrir')))))),
        total === 0 && empty('Sem pedidos no período.'));
    } catch (e) { body.replaceChildren(errorBox(e.message, load)); }
  }
  shell(path, h('h1', {}, 'Dashboard'), h('div', { class: 'row' }, btns, custom, h('button', { class: 'btn', onclick: load }, '↻ Atualizar'), stamp), body); load();
}

// ---------- Analytics (eventos anônimos de navegação) ----------
async function analyticsPage(path) {
  let preset = '30d'; const body = h('div', { 'aria-live': 'polite' }, loading()), stamp = h('small', { class: 'muted' });
  const range = () => { const end = new Date(), today = spDay(); const f = preset === 'today' ? spStart(today) : preset === '7d' ? new Date(end - 7 * 864e5) : preset === 'month' ? spStart(today.slice(0, 8) + '01') : new Date(end - 30 * 864e5); return { from: f.toISOString(), to: end.toISOString() }; };
  const btns = [['today', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['month', 'Mês atual']].map(([k, t]) => h('button', { class: 'btn' + (k === preset ? ' btn-primary' : ''), type: 'button', 'data-k': k, onclick: () => { preset = k; btns.forEach(b => b.classList.toggle('btn-primary', b.dataset.k === k)); load(); } }, t));
  async function load() {
    body.replaceChildren(loading());
    try {
      const r = range(), days = (Date.parse(r.to) - Date.parse(r.from)) / 864e5, bucket = days > 120 ? 'month' : days > 45 ? 'week' : 'day';
      const d = await api(`/api/admin/analytics?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}&bucket=${bucket}`);
      const t = d.totals, f = d.funnel, rate = (x, y) => y ? (x / y * 100).toFixed(1) + '%' : '—', nb = ({ day: 'dia', week: 'semana', month: 'mês' })[bucket];
      stamp.textContent = 'Atualizado em ' + fmtDate(d.generated_at);
      const HB = (title, rows, l, v) => hbars(title, rows.map(x => ({ l: l(x), v: v(x) })), String);
      const dev = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computador' };
      const pt = rows => tbl(['Produto', 'Visualizações', 'No carrinho', 'Vendidos', 'Visualização → carrinho'], rows.map(p => h('tr', {}, h('td', {}, p.name), h('td', {}, p.views), h('td', {}, p.carts), h('td', {}, p.sold), h('td', {}, rate(p.carts, p.views)))));
      body.replaceChildren(
        h('div', { class: 'kpis' }, kpi('Sessões', String(t.sessions), 'Abas/visitas anônimas', 'eye', 1), kpi('Páginas vistas', String(t.pageviews), `${t.sessions ? (t.pageviews / t.sessions).toFixed(1) : 0} por sessão`, 'receipt', 1), kpi('Visualizações de produto', String(t.product_views), null, 'package', 1), kpi('Adições ao carrinho', String(t.add_to_cart), null, 'cart', 1)),
        h('div', { class: 'kpis sm' }, kpi('Viram um produto', rate(f.product_view, f.sessions), 'das sessões'), kpi('Adicionaram ao carrinho', rate(f.add_to_cart, f.sessions), 'das sessões'), kpi('Iniciaram checkout', rate(f.checkout_start, f.sessions), 'das sessões'), kpi('Conversão em venda', rate(f.paid_orders, f.sessions), `${f.paid_orders} pedido(s) pago(s)`), kpi('Buscas no site', String(t.searches))),
        h('div', { class: 'charts' },
          lineChart('Sessões por ' + nb, d.series.map(x => ({ l: x.d, v: x.sessions }))),
          lineChart('Páginas vistas por ' + nb, d.series.map(x => ({ l: x.d, v: x.pageviews }))),
          HB('Funil de conversão (sessões)', [['Sessões', f.sessions], ['Viram um produto', f.product_view], ['Adicionaram ao carrinho', f.add_to_cart], ['Iniciaram checkout', f.checkout_start], ['Pedidos pagos', f.paid_orders]], x => x[0], x => x[1]),
          HB('Páginas mais visitadas', d.top_pages, x => x.path, x => x.n),
          HB('Origem do tráfego (sites de referência)', d.referrers, x => x.referrer, x => x.n),
          HB('Dispositivos', d.devices, x => dev[x.device] || x.device, x => x.n),
          HB('Termos mais buscados', d.searches, x => x.term, x => x.n),
          HB('Horários de pico (páginas vistas)', d.hours, x => x.h + 'h', x => x.n)),
        h('h2', {}, 'Produtos mais vistos'), pt(d.products.slice(0, 15)),
        h('h2', {}, 'Mais adicionados ao carrinho'), pt(d.products.filter(p => p.carts > 0).sort((x, y) => y.carts - x.carts).slice(0, 15)),
        h('p', { class: 'note' }, 'Sessão = aba/visita anônima (não identifica pessoas; a mesma pessoa pode gerar várias). A coleta começa após a publicação e não conta quem bloqueia rastreio ou usa "Do Not Track".'));
    } catch (e) { body.replaceChildren(errorBox(e.message, load)); }
  }
  shell(path, h('h1', {}, 'Analytics'), h('div', { class: 'row' }, btns, h('button', { class: 'btn', onclick: load }, '↻ Atualizar'), stamp), body); load();
}

// ---------- Produtos (com edição em massa) ----------
async function products(path, page = 1) {
  const out = h('div', {}, loading()), q = h('input', { type: 'search', placeholder: 'Buscar produto', 'aria-label': 'Buscar produto' }), sel = new Set(), cnt = h('strong'), bulk = h('div', { class: 'card form', hidden: true });
  let items = [], last = { page: 1, total: 0, pageSize: 20 };
  shell(path, h('h1', {}, 'Produtos'), h('div', { class: 'row' }, a('/admin/produtos/novo', { class: 'btn btn-primary' }, 'Novo produto'), h('form', { onsubmit: e => { e.preventDefault(); load(1); } }, q, h('button', { class: 'btn', type: 'submit' }, 'Buscar'))), bulk, out);
  const sync = () => { bulk.hidden = !sel.size; cnt.textContent = sel.size + ' selecionado(s)'; };
  const tri = t => h('select', { 'aria-label': t }, h('option', { value: '' }, t + ': não alterar'), h('option', { value: '1' }, t + ': sim'), h('option', { value: '0' }, t + ': não'));
  const cats = await api('/api/admin/categories').catch(() => []);
  const f = { is_active: tri('Ativo'), is_featured: tri('Destaque'), is_new: tri('Novidade'), is_upsell: tri('Leve também') };
  const cat = h('select', { 'aria-label': 'Categoria' }, h('option', { value: '' }, 'Categoria: não alterar'), h('option', { value: '__none' }, 'Sem categoria'), cats.map(c => h('option', { value: c.id }, c.name)));
  const plat = h('input', { type: 'text', maxlength: 60, placeholder: 'Plataforma (vazio = não alterar)', 'aria-label': 'Plataforma' });
  const maxq = h('input', { type: 'number', min: 1, max: 10, placeholder: 'Máx. por pedido', 'aria-label': 'Máx. por pedido' });
  const adj = h('input', { type: 'number', step: '0.1', min: -90, max: 500, placeholder: 'Ajuste de preço % (ex.: 10 ou -5)', 'aria-label': 'Ajuste de preço em porcentagem' });
  const promo = h('input', { type: 'number', min: 1, max: 90, placeholder: 'Promoção: % de desconto', 'aria-label': 'Promoção em porcentagem' });
  const clr = h('input', { type: 'checkbox' });
  const apply = h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
    const ch = {};
    for (const [k, s] of Object.entries(f)) if (s.value !== '') ch[k] = s.value === '1';
    if (cat.value) ch.category_id = cat.value === '__none' ? null : cat.value;
    if (plat.value.trim()) ch.platform = plat.value.trim();
    if (maxq.value) ch.max_per_order = Number(maxq.value);
    if (adj.value) ch.price_adjust_pct = Number(adj.value);
    if (promo.value) ch.promo_pct = Number(promo.value);
    if (clr.checked) ch.clear_promo = true;
    if (!Object.keys(ch).length) return toast('Escolha ao menos uma alteração.', 'err');
    if (!confirm(`Aplicar as alterações a ${sel.size} produto(s)?`)) return;
    try { const r = await api('/api/admin/products-bulk', { method: 'POST', body: { ids: [...sel], changes: ch } }); toast(`${r.updated} produto(s) atualizado(s).`); sel.clear(); sync(); load(last.page || 1); } catch (e) { toast(e.message, 'err'); }
  } }, 'Aplicar aos selecionados');
  bulk.append(cnt, h('div', { class: 'form-grid' }, ...Object.values(f), cat, plat, maxq, adj, promo), h('label', { class: 'check' }, clr, ' Remover promoção'),
    h('div', { class: 'row' }, apply, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { sel.clear(); sync(); render(); } }, 'Limpar seleção')));
  const chk = p => h('input', { type: 'checkbox', checked: sel.has(p.id), 'aria-label': 'Selecionar ' + p.name, onchange: e => { e.target.checked ? sel.add(p.id) : sel.delete(p.id); sync(); } });
  const render = () => {
    const all = h('input', { type: 'checkbox', 'aria-label': 'Selecionar todos desta página', checked: items.length > 0 && items.every(p => sel.has(p.id)), onchange: e => { items.forEach(p => e.target.checked ? sel.add(p.id) : sel.delete(p.id)); sync(); render(); } });
    out.replaceChildren(tbl([all, 'Nome', 'Plataforma', 'Preço', 'Estoque', 'Status', ''], items.map(p => h('tr', {}, h('td', {}, chk(p)), h('td', {}, p.name), h('td', {}, p.platform || '—'), h('td', {}, money(p.price_cents), p.promo_price_cents && ` (promo ${money(p.promo_price_cents)})`), h('td', {}, p.track_stock ? p.stock : '—'), h('td', {}, p.is_active ? 'Ativo' : 'Inativo'), h('td', {}, a('/admin/produtos/' + p.id, { class: 'btn' }, 'Editar'))))), pager(last, load));
  };
  async function load(pg) { try { const r = await api(`/api/admin/products?page=${pg}&q=${encodeURIComponent(q.value)}`); items = r.items; last = { ...r, pageSize: 20 }; render(); } catch (e) { out.replaceChildren(errorBox(e.message, () => load(pg))); } }
  sync(); load(page);
}

async function productForm(path, id) {
  setPage(id ? 'Editar produto' : 'Novo produto', { noindex: true });
  const out = h('div', {}, loading()); shell(path, h('h1', {}, id ? 'Editar produto' : 'Novo produto'), out);
  try {
    const [cats, p] = await Promise.all([api('/api/admin/categories'), id ? api('/api/admin/products/' + id) : Promise.resolve({ delivery: {}, images: [], is_active: true, is_new: true, max_per_order: 2 })]);
    // ---- plataforma: lista com o que já foi usado (evita erro de digitação) ----
    const plats = await api('/api/platforms', { auth: false }).catch(() => []);
    const platList = [...new Set(['Xbox', 'Steam', 'Assinatura', 'Curso', ...plats, p.platform].filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const platSel = h('select', {}, h('option', { value: '' }, 'Sem plataforma'), platList.map(x => h('option', { value: x, selected: x === p.platform }, x)), h('option', { value: '__new' }, '+ Nova plataforma…'));
    const platNew = h('input', { type: 'text', maxlength: 60, placeholder: 'Nome da nova plataforma', hidden: true });
    platSel.addEventListener('change', () => { platNew.hidden = platSel.value !== '__new'; if (!platNew.hidden) platNew.focus(); });
    const platProxy = { get value() { return platSel.value === '__new' ? platNew.value.trim() : platSel.value; }, set value(v) { platSel.value = v || ''; platNew.hidden = true; } };
    const inp = (k, o = {}) => h('input', { type: 'text', value: p[k] ?? '', ...o }), ta = (v, rows, max) => h('textarea', { rows, maxlength: max }, v ?? '');
    const chk = (c, t) => h('label', { class: 'check' }, c, ' ' + t), cents = v => (v === '' ? null : Math.round(Number(v) * 100));
    const f = { name: inp('name', { required: true, maxlength: 140 }), slug: inp('slug', { maxlength: 120, placeholder: 'gerado do nome' }), long: ta(p.long_description || p.short_description, 5, 8000), platform: platProxy,
      cat: h('select', {}, h('option', { value: '' }, 'Sem categoria'), cats.map(c => h('option', { value: c.id, selected: c.id === p.category_id }, c.name))),
      price: h('input', { type: 'number', step: '0.01', min: '0.01', required: true, value: p.price_cents ? (p.price_cents / 100).toFixed(2) : '' }), promo: h('input', { type: 'number', step: '0.01', min: '0.01', value: p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : '' }),
      track: h('input', { type: 'checkbox', checked: p.track_stock }), stock: h('input', { type: 'number', min: 0, value: p.stock ?? 0 }), maxq: h('input', { type: 'number', min: 1, max: 10, value: p.max_per_order || 1 }),
      active: h('input', { type: 'checkbox', checked: p.is_active }), feat: h('input', { type: 'checkbox', checked: p.is_featured }), isnew: h('input', { type: 'checkbox', checked: p.is_new }),
      upsell: h('input', { type: 'checkbox', checked: p.is_upsell }),
      region: inp('region'), edition: inp('edition'), req: ta(p.requirements, 2, 1000), terms: ta(p.specific_terms, 2, 2000), ins: ta((p.delivery || {}).instructions, 5, 4000) };
    // ---- versões do Xbox (só aparece na categoria "Jogos para videogames") ----
    const XV = ['XBOX ONE E SERIES X|S', 'XBOX SERIES X|S', 'XBOX 360'];
    const xv = XV.map(v => ({ v, c: h('input', { type: 'checkbox', checked: (p.xbox_versions || []).includes(v) }) }));
    const xbox = h('fieldset', { class: 'fset' }, h('legend', {}, 'Versões do Xbox (marque uma ou mais)'), h('div', { class: 'row' }, xv.map(x => h('label', { class: 'check' }, x.c, ' ' + x.v))));
    const isXbox = () => cats.find(c => c.id === f.cat.value)?.slug === 'jogos-videogames';
    const sync = () => { xbox.hidden = !isXbox(); };
    f.cat.addEventListener('change', sync); sync();
    // ---- modelos rápidos (só no cadastro) ----
    const PRESETS = [['Jogo Xbox · R$ 30', 'jogos-videogames', 'Xbox', '30.00'], ['Jogo Steam', 'jogos-pc-steam', 'Steam', '7.90'], ['Pack / assinatura', 'packs-assinaturas', '', '']];
    const presets = !id && h('div', { class: 'presets' }, h('strong', {}, 'Modelo rápido:'), PRESETS.map(([t, slug, plat, price]) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { f.cat.value = cats.find(c => c.slug === slug)?.id || ''; sync(); f.platform.value = plat; f.price.value = price; f.maxq.value = 2; f.active.checked = true; f.isnew.checked = true; f.name.focus(); } }, t)));
    // ---- imagens: colar (Ctrl+V), arrastar ou escolher ----
    const server = [...p.images], pending = [], list = h('div', { class: 'img-list' });
    const fig = (src, rm, pend) => h('figure', {}, h('img', { src, alt: 'Imagem do produto' }), pend && h('small', {}, 'Será enviada ao salvar'), h('button', { class: 'btn btn-ghost', type: 'button', onclick: rm }, 'Remover'));
    const draw = () => list.replaceChildren(
      ...server.map(i => fig(i.url, async () => { if (!confirm('Remover imagem?')) return; try { await api(`/api/admin/products/${id}/images/${i.id}`, { method: 'DELETE' }); server.splice(server.indexOf(i), 1); draw(); } catch (er) { toast(er.message, 'err'); } })),
      ...pending.map(i => fig(i.preview, () => { pending.splice(pending.indexOf(i), 1); draw(); }, true)));
    const upload = (pid, file) => api(`/api/admin/products/${pid}/images`, { method: 'POST', raw: file, contentType: file.type });
    async function addFile(file) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast('Use PNG, JPG ou WebP.', 'err');
      if (file.size > 2 * 1024 * 1024) return toast('Máximo 2 MB.', 'err');
      if (server.length + pending.length >= 8) return toast('Máximo de 8 imagens.', 'err');
      try {
        if (id) { const r = await upload(id, file); server.push({ id: r.id, url: r.url }); toast('Imagem enviada.'); }
        else pending.push({ file, preview: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }) });
        draw();
      } catch (er) { toast(er.message, 'err'); }
    }
    const addAll = async files => { for (const x of files) await addFile(x); };
    const onPaste = e => { if (!out.isConnected) return document.removeEventListener('paste', onPaste); const fs = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/')); if (!fs.length) return; e.preventDefault(); addAll(fs); };
    document.addEventListener('paste', onPaste);
    const zone = h('div', { class: 'dropzone', tabindex: 0, ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); addAll([...e.dataTransfer.files]); } }, h('strong', {}, 'Cole a imagem aqui (Ctrl+V)'), h('span', { class: 'muted' }, 'ou arraste um arquivo • PNG, JPG ou WebP até 2 MB • a primeira é a principal'),
      h('input', { type: 'file', multiple: true, accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Escolher imagens', onchange: e => { addAll([...e.target.files]); e.target.value = ''; } }));
    draw();
    // ---- salvar ----
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar');
    const again = !id && h('button', { class: 'btn', type: 'button', onclick: () => form.reportValidity() && submit(true) }, 'Salvar e criar outro');
    async function submit(next) {
      save.disabled = true;
      const body = { name: f.name.value, slug: f.slug.value || undefined, long_description: f.long.value, platform: f.platform.value, category_id: f.cat.value || null, price_cents: cents(f.price.value), promo_price_cents: cents(f.promo.value), track_stock: f.track.checked, stock: f.track.checked ? Number(f.stock.value) : null, max_per_order: Number(f.maxq.value), is_active: f.active.checked, is_featured: f.feat.checked, is_new: f.isnew.checked, is_upsell: f.upsell.checked, region: f.region.value, edition: f.edition.value, requirements: f.req.value, specific_terms: f.terms.value, xbox_versions: isXbox() ? xv.filter(x => x.c.checked).map(x => x.v) : [], delivery: { instructions: f.ins.value } };
      try {
        let pid = id;
        if (id) await api('/api/admin/products/' + id, { method: 'PATCH', body }); else pid = (await api('/api/admin/products', { method: 'POST', body })).id;
        try { while (pending.length) { await upload(pid, pending[0].file); pending.shift(); } }
        catch (er) { toast('Produto salvo, mas uma imagem falhou: ' + er.message, 'err'); if (!id) return go('/admin/produtos/' + pid); }
        toast('Produto salvo.');
        if (!id) return go(next ? '/admin/produtos/novo' : '/admin/produtos/' + pid);
      } catch (er) { toast(er.message, 'err'); }
      save.disabled = false;
    }
    const form = h('form', { class: 'form card', onsubmit: e => { e.preventDefault(); submit(false); } },
      h('div', { class: 'form-grid' }, field('Nome', f.name), h('div', {}, field('Plataforma', platSel), platNew), field('Categoria', f.cat), field('Slug (URL)', f.slug), field('Preço (R$)', f.price), field('Preço promocional (R$, opcional)', f.promo, 'Deve ser menor que o preço.')),
      xbox,
      field('Descrição', f.long),
      h('div', { class: 'form-grid' }, field('Máx. por pedido (1–10)', f.maxq, 'Para o combo "2 por R$ 45" num mesmo produto, use 2 ou mais.'), field('Estoque', f.stock)),
      h('div', { class: 'row' }, chk(f.active, 'Ativo (visível)'), chk(f.feat, 'Destaque'), chk(f.isnew, 'Novidade'), chk(f.track, 'Controlar estoque'), chk(f.upsell, 'Sugerir em "Leve também" (carrinho)')),
      h('h2', {}, 'Imagens'), zone, list,
      h('h2', {}, 'Instruções pós-compra'), h('p', { class: 'note' }, 'Privadas: o cliente só vê depois do pagamento confirmado.'), f.ins,
      h('details', {}, h('summary', {}, 'Mais opções (região, edição, requisitos, termos)'), field('Região', f.region), field('Edição', f.edition), field('Requisitos', f.req), field('Termos específicos', f.terms)),
      h('div', { class: 'row' }, save, again));
    const del = id && h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (confirm('Excluir/arquivar este produto? Se já foi vendido, ele será apenas arquivado.')) { try { await api('/api/admin/products/' + id, { method: 'DELETE' }); toast('Produto removido.'); go('/admin/produtos'); } catch (er) { toast(er.message, 'err'); } } } }, 'Excluir / arquivar');
    out.replaceChildren(...[presets, form, del].filter(Boolean));
  } catch (e) { out.replaceChildren(errorBox(e.message)); }
}

// ---------- Mais vendidos (o admin escolhe o que aparece na loja) ----------
async function bestsellersPage(path) {
  const out = h('div', {}, loading()); shell(path, h('h1', {}, 'Mais vendidos'), out);
  try {
    const all = await api('/api/admin/bestsellers');
    let sel = all.filter(x => x.is_bestseller).sort((x, y) => x.bestseller_pos - y.bestseller_pos);
    const q = h('input', { type: 'search', placeholder: 'Buscar produto para adicionar', 'aria-label': 'Buscar produto' });
    const selBox = h('div', {}), listBox = h('div', {});
    const mv = (i, d) => { const j = i + d; if (j < 0 || j >= sel.length) return; [sel[i], sel[j]] = [sel[j], sel[i]]; draw(); };
    function draw() {
      const chosen = new Set(sel.map(x => x.id)), term = q.value.trim().toLowerCase();
      const rest = all.filter(x => !chosen.has(x.id) && x.name.toLowerCase().includes(term)).slice(0, 30);
      selBox.replaceChildren(h('h2', {}, `Exibidos na loja (${sel.length})`),
        sel.length ? h('ol', {}, sel.map((x, i) => h('li', { class: 'row' }, h('span', {}, x.name), h('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Subir', onclick: () => mv(i, -1) }, '↑'), h('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Descer', onclick: () => mv(i, 1) }, '↓'), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => { sel.splice(i, 1); draw(); } }, 'Remover')))) : empty('Nenhum selecionado: a seção não aparece na loja.'));
      listBox.replaceChildren(rest.length ? h('ul', {}, rest.map(x => h('li', { class: 'row' }, h('span', {}, x.name + (x.platform ? ' · ' + x.platform : '')), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { if (sel.length >= 40) return toast('Máximo de 40.', 'err'); sel.push(x); draw(); } }, 'Adicionar')))) : empty('Nenhum produto encontrado.'));
    }
    q.addEventListener('input', draw); draw();
    const save = h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { try { await api('/api/admin/bestsellers', { method: 'PUT', body: { ids: sel.map(x => x.id) } }); toast('Mais vendidos salvos.'); } catch (er) { toast(er.message, 'err'); } } }, 'Salvar');
    out.replaceChildren(h('p', { class: 'note' }, 'Só os produtos desta lista aparecem em "Mais vendidos" na página inicial, na ordem daqui. Só produtos ativos entram.'), selBox, save, h('h2', {}, 'Adicionar produto'), q, listBox);
  } catch (er) { out.replaceChildren(errorBox(er.message)); }
}

async function orders(path) {
  const qs = new URLSearchParams(location.search); const out = h('div', {}, loading());
  const sel = (name, opts) => h('select', { name, 'aria-label': name }, h('option', { value: '' }, 'Todos'), opts.map(k => h('option', { value: k, selected: qs.get(name) === k }, STATUS[k] || k)));
  const f = h('form', { class: 'filters', onsubmit: e => { e.preventDefault(); const p = new URLSearchParams(new FormData(f)); [...p].forEach(([k, v]) => !v && p.delete(k)); go('/admin/pedidos' + (p.toString() ? '?' + p : '')); } }, h('div', { class: 'field' }, h('label', {}, 'Pedido'), h('input', { name: 'ref', value: qs.get('ref') || '' })), h('div', { class: 'field' }, h('label', {}, 'Pagamento'), sel('payment_status', ['pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded'])), h('div', { class: 'field' }, h('label', {}, 'Entrega'), sel('delivery_status', ['pending', 'delivered', 'needs_review'])), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Filtrar'));
  shell(path, h('h1', {}, 'Pedidos'), f, out);
  async function load(pg) { try { const p = new URLSearchParams(qs); p.set('page', pg); const r = await api('/api/admin/orders?' + p); out.replaceChildren(tbl(['Pedido', 'Data', 'Total', 'Pagamento', 'Entrega', ''], r.items.map(o => h('tr', {}, h('td', {}, o.public_ref), h('td', {}, fmtDate(o.created_at)), h('td', {}, money(o.total_cents)), h('td', {}, badge(o.payment_status)), h('td', {}, badge(o.delivery_status)), h('td', {}, a('/admin/pedidos/' + o.id, { class: 'btn' }, 'Abrir')))))); out.append(pager({ ...r, pageSize: 20 }, load)); } catch (e) { out.replaceChildren(errorBox(e.message, () => load(pg))); } }
  load(1);
}
async function orderDetail(path, id) {
  const out = h('div', {}, loading()); shell(path, a('/admin/pedidos', {}, '← Pedidos'), out);
  async function load() { try {
    const o = await api('/api/admin/orders/' + id); const act = (label, fn, cls = 'btn') => h('button', { class: cls, type: 'button', onclick: async () => { try { await fn(); load(); } catch (e) { toast(e.message, 'err'); } } }, label); const note = h('textarea', { rows: 2, maxlength: 2000, 'aria-label': 'Nova nota interna' });
    const cost = h('input', { type: 'number', step: '0.01', min: '0', value: o.cost_cents != null ? (o.cost_cents / 100).toFixed(2) : '' });
    out.replaceChildren(h('h1', {}, 'Pedido ' + o.public_ref), h('p', {}, badge(o.payment_status), ' ', badge(o.delivery_status), ' • ', fmtDate(o.created_at), ' • ', h('strong', {}, money(o.total_cents))),
      h('dl', { class: 'specs' }, [['Referência InfinitePay (order_nsu)', o.order_nsu], ['Transação', o.transaction_nsu || '—'], ['Pago em', fmtDate(o.paid_at)], ['Desconto combo', o.discount_cents ? '-' + money(o.discount_cents) : '—'], ['Cupom', o.coupon_cents ? `${o.coupon_code} (-${money(o.coupon_cents)})` : '—'], ['Valor pago (c/ taxas do cliente)', o.paid_amount_cents ? money(o.paid_amount_cents) : '—'], ['Custo informado', o.cost_cents != null ? money(o.cost_cents) : '—'], ['Método', o.payment_method || '—'], ['Cliente abriu o botão do WhatsApp', o.whatsapp_link_opened_at ? fmtDate(o.whatsapp_link_opened_at) : 'não registrado']].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      tbl(['Item', 'Qtd', 'Unitário', 'Subtotal'], o.items.map(i => h('tr', {}, h('td', {}, i.name_snapshot), h('td', {}, i.quantity), h('td', {}, money(i.unit_price_cents)), h('td', {}, money(i.subtotal_cents))))),
      h('div', { class: 'row' }, o.payment_status === 'pending' && act('Reconciliar com a InfinitePay', async () => { const r = await api(`/api/admin/orders/${id}/reconcile`, { method: 'POST' }); toast(r.paid ? 'Pagamento confirmado.' : 'Ainda não consta como pago.'); }), o.payment_status === 'paid' && o.delivery_status !== 'delivered' && act('Marcar como entregue', () => api('/api/admin/orders/' + id, { method: 'PATCH', body: { delivery_status: 'delivered', status: 'completed' } }), 'btn btn-primary'), o.payment_status === 'paid' && o.status === 'paid' && act('Em atendimento', () => api('/api/admin/orders/' + id, { method: 'PATCH', body: { status: 'in_delivery' } })), o.payment_status === 'pending' && act('Cancelar pedido', () => api('/api/admin/orders/' + id, { method: 'PATCH', body: { status: 'cancelled' } }), 'btn btn-danger'),
        o.payment_status === 'paid' && act('Registrar estorno (exceção)', async () => { const j = prompt('ATENÇÃO: registre isto só depois de estornar no app da InfinitePay. Justificativa (mín. 10 caracteres):'); if (j) await api(`/api/admin/orders/${id}/flag-refund`, { method: 'POST', body: { justification: j } }); }, 'btn btn-danger')),
      o.payment_status === 'paid' && h('form', { class: 'form card', onsubmit: async ev => { ev.preventDefault(); try { await api('/api/admin/orders/' + id, { method: 'PATCH', body: { cost_cents: cost.value === '' ? null : Math.round(Number(cost.value) * 100) } }); toast('Custo salvo.'); load(); } catch (er) { toast(er.message, 'err'); } } }, field('Custo deste pedido (R$)', cost, 'Quanto você pagou pelo produto. Alimenta o lucro do dashboard.'), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar custo')),
      h('p', { class: 'note' }, 'O sistema não permite marcar pedido como pago manualmente: a confirmação vem da InfinitePay.'),
      h('h2', {}, 'Pagamentos / eventos'), tbl(['Quando', 'Origem', 'Resultado', 'Valor'], o.events.map(e => h('tr', {}, h('td', {}, fmtDate(e.created_at)), h('td', {}, e.source), h('td', {}, e.validation_result), h('td', {}, e.amount_cents ? money(e.amount_cents) : '—')))),
      h('h2', {}, 'Notas internas (invisíveis ao cliente)'), h('form', { onsubmit: async e => { e.preventDefault(); if (!note.value.trim()) return; try { await api(`/api/admin/orders/${id}/notes`, { method: 'POST', body: { note: note.value } }); load(); } catch (er) { toast(er.message, 'err'); } } }, note, h('button', { class: 'btn', type: 'submit' }, 'Adicionar nota')), h('ul', {}, o.notes.map(n => h('li', {}, fmtDate(n.created_at) + ' — ' + n.note))));
  } catch (e) { out.replaceChildren(errorBox(e.message, load)); } } load();
}
async function reports(path) {
  const f = h('input', { type: 'date', value: spDay(new Date(Date.now() - 30 * 864e5)) }), t = h('input', { type: 'date', value: spDay() });
  const btn = h('button', { class: 'btn btn-primary', onclick: async () => { try { const csv = await api(`/api/admin/orders/export.csv?from=${encodeURIComponent(spStart(f.value).toISOString())}&to=${encodeURIComponent(new Date(spStart(t.value).getTime() + 864e5).toISOString())}`); const u = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); const l = h('a', { href: u, download: 'pedidos.csv' }); document.body.append(l); l.click(); l.remove(); URL.revokeObjectURL(u); } catch (e) { toast(e.message, 'err'); } } }, 'Exportar pedidos (CSV)');
  const rec = h('button', { class: 'btn', onclick: async () => { try { const r = await api('/api/admin/reconcile', { method: 'POST' }); toast(`Conferidos ${r.checked}; expirados ${r.expired}; pagos ${r.paid}.`); } catch (e) { toast(e.message, 'err'); } } }, 'Conferir/expirar pedidos pendentes antigos');
  shell(path, h('h1', {}, 'Relatórios'), h('p', { class: 'note' }, 'O CSV não inclui e-mail nem dados pessoais de clientes.'), h('div', { class: 'row' }, h('label', {}, 'De ', f), h('label', {}, 'Até ', t), btn), h('h2', {}, 'Manutenção'), rec);
}

// ---------- Cupons ----------
async function couponsPage(path) {
  const out = h('div', {}, loading()); shell(path, h('h1', {}, 'Cupons'), out);
  const code = h('input', { type: 'text', maxlength: 20, placeholder: 'EX: BEMVINDO' }), pc = h('input', { type: 'number', min: 1, max: 90, value: 5 });
  async function load() { try {
    const rows = await api('/api/admin/coupons');
    out.replaceChildren(
      h('form', { class: 'form card', onsubmit: async e => { e.preventDefault(); try { await api('/api/admin/coupons', { method: 'POST', body: { code: code.value, percent: Number(pc.value) } }); code.value = ''; load(); } catch (er) { toast(er.message, 'err'); } } }, field('Código do cupom', code, 'Só letras e números.'), field('Desconto (%)', pc), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Adicionar cupom')),
      tbl(['Código', 'Desconto', ''], rows.map(c => h('tr', {}, h('td', {}, c.code), h('td', {}, c.percent + '%'), h('td', {}, h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (!confirm('Excluir o cupom ' + c.code + '?')) return; try { await api('/api/admin/coupons/' + c.code, { method: 'DELETE' }); load(); } catch (er) { toast(er.message, 'err'); } } }, 'Excluir'))))));
  } catch (er) { out.replaceChildren(errorBox(er.message, load)); } }
  load();
}

async function settingsPage(path) {
  const out = h('div', {}, loading()); shell(path, h('h1', {}, 'Configurações'), out);
  try {
    const { settings: s, pages } = await api('/api/admin/settings'); const i = (k, o = {}) => h('input', { type: 'text', value: s[k] ?? '', ...o }); const e = { store_name: i('store_name', { maxlength: 80 }), whatsapp_number: i('whatsapp_number', { inputmode: 'numeric', placeholder: '5511999999999' }), whatsapp_message: h('textarea', { rows: 3, maxlength: 500 }, s.whatsapp_message ?? ''), support_text: i('support_text', { maxlength: 200 }), instagram_url: i('instagram_url', { placeholder: 'https://instagram.com/…' }), alert_pending_hours: i('alert_pending_hours', { inputmode: 'numeric' }), alert_low_stock: i('alert_low_stock', { inputmode: 'numeric' }) };
    const cb = { en: h('input', { type: 'checkbox', checked: s.combo_enabled === '1' }), qty: h('input', { type: 'number', min: 2, max: 10, value: s.combo_qty || 2 }), unit: h('input', { type: 'number', step: '0.01', min: '0.01', value: ((Number(s.combo_unit_cents) || 3000) / 100).toFixed(2) }), price: h('input', { type: 'number', step: '0.01', min: '0.01', value: ((Number(s.combo_price_cents) || 4500) / 100).toFixed(2) }) };
    const c100 = v => String(Math.round(Number(v) * 100));
    // ---- combos adicionais (além do combo principal) ----
    let extra = []; try { extra = JSON.parse(s.combos_json || '[]'); } catch { /* */ }
    const exBox = h('div'), cents = v => Math.round(Number(v) * 100);
    const drawEx = () => exBox.replaceChildren(...extra.map((c, idx) => {
      const n = h('input', { type: 'text', maxlength: 40, value: c.name || '', placeholder: 'Ex.: 3 por R$ 60' }), q = h('input', { type: 'number', min: 2, max: 10, value: c.qty }),
        u = h('input', { type: 'number', step: '0.01', min: '0.01', value: (c.unit / 100).toFixed(2) }), p = h('input', { type: 'number', step: '0.01', min: '0.01', value: (c.price / 100).toFixed(2) }), on = h('input', { type: 'checkbox', checked: c.on !== false });
      const sync = () => { extra[idx] = { name: n.value, qty: Number(q.value), unit: cents(u.value), price: cents(p.value), on: on.checked }; };
      [n, q, u, p, on].forEach(x => { x.addEventListener('input', sync); x.addEventListener('change', sync); });
      return h('div', { class: 'form-grid card' }, field('Nome', n), field('Quantidade', q), field('Preço unitário (R$)', u), field('Preço do combo (R$)', p), h('label', { class: 'check' }, on, ' Ativo'),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => { extra.splice(idx, 1); drawEx(); } }, 'Remover'));
    }));
    drawEx();
    const addEx = h('button', { class: 'btn', type: 'button', onclick: () => { if (extra.length >= 20) return toast('Máximo de 20.', 'err'); extra.push({ name: '', qty: 3, unit: 3000, price: 6000, on: true }); drawEx(); } }, '+ Adicionar combo');
    // ---- textos e seções da loja editáveis ----
    const ta = (k, rows, max, fb = '') => h('textarea', { rows, maxlength: max }, s[k] ?? fb);
    const tx = { hero_eyebrow: i('hero_eyebrow', { maxlength: 80 }), hero_title: i('hero_title', { maxlength: 120 }), hero_title_grad: i('hero_title_grad', { maxlength: 40 }), hero_lead: ta('hero_lead', 3, 400),
      ticker_text: ta('ticker_text', 4, 600, 'Checkout seguro InfinitePay\nEntrega automática\nInstruções liberadas após a confirmação do pagamento\nSuporte direto no WhatsApp'),
      faq_text: ta('faq_text', 12, 3500, FAQ.map(([q, r]) => q + ' ## ' + r).join('\n')), steps_text: ta('steps_text', 5, 1200, STEPS.map(([, t, d]) => t + ' ## ' + d).join('\n')),
      legal_text: ta('legal_text', 3, 800), popup_title: i('popup_title', { maxlength: 80 }), popup_text: i('popup_text', { maxlength: 200 }), popup_code: i('popup_code', { maxlength: 20, placeholder: 'Deve ser um cupom ativo' }) };
    const sec = Object.fromEntries(['sec_bestseller', 'sec_featured', 'sec_new', 'sec_how', 'sec_faq', 'popup_enabled'].map(k => [k, h('input', { type: 'checkbox', checked: s[k] !== '0' })]));
    const form = h('form', { class: 'form card', onsubmit: async ev => { ev.preventDefault(); try { await api('/api/admin/settings', { method: 'PUT', body: { ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.value])), combo_enabled: cb.en.checked ? '1' : '0', combo_qty: cb.qty.value, combo_unit_cents: c100(cb.unit.value), combo_price_cents: c100(cb.price.value), combos_json: JSON.stringify(extra), ...Object.fromEntries(Object.entries(tx).map(([k, v]) => [k, v.value])), ...Object.fromEntries(Object.entries(sec).map(([k, v]) => [k, v.checked ? '1' : '0'])) } }); toast('Configurações salvas.'); } catch (er) { toast(er.message, 'err'); } } }, field('Nome da loja', e.store_name), field('WhatsApp oficial (só dígitos, com DDI)', e.whatsapp_number, 'Ex.: 5511999999999'), field('Mensagem inicial do WhatsApp', e.whatsapp_message, 'Use {pedido} onde o código do pedido deve entrar.'), field('Texto de suporte (rodapé)', e.support_text), field('Instagram (URL https)', e.instagram_url), field('Alerta: pedido pendente após (horas)', e.alert_pending_hours), field('Alerta: estoque baixo até (unidades)', e.alert_low_stock),
      h('h2', {}, 'Textos da página inicial'), field('Selo acima do título', tx.hero_eyebrow, 'Vazio = texto padrão.'), field('Título', tx.hero_title), field('Parte colorida do título', tx.hero_title_grad), field('Subtítulo', tx.hero_lead),
      field('Faixa de avisos do topo (um por linha)', tx.ticker_text), field('Passos do "Como comprar" (formato: Título ## Descrição, um por linha, ideal 4)', tx.steps_text), field('Perguntas frequentes (formato: Pergunta ## Resposta, uma por linha)', tx.faq_text), field('Texto legal do rodapé', tx.legal_text),
      h('h2', {}, 'Seções da página inicial'), h('label', { class: 'check' }, sec.sec_bestseller, ' Mais vendidos'), h('label', { class: 'check' }, sec.sec_featured, ' Em destaque'), h('label', { class: 'check' }, sec.sec_new, ' Novidades'), h('label', { class: 'check' }, sec.sec_how, ' Como comprar'), h('label', { class: 'check' }, sec.sec_faq, ' Perguntas frequentes'),
      h('h2', {}, 'Pop-up de cupom'), h('label', { class: 'check' }, sec.popup_enabled, ' Pop-up ativo'), field('Código do cupom', tx.popup_code, 'Crie o cupom antes em Cupons. O pop-up só aparece com código preenchido.'), field('Título', tx.popup_title), field('Texto', tx.popup_text),
      h('h2', {}, 'Combo promocional'), h('label', { class: 'check' }, cb.en, ' Combo ativo'), field('Quantidade do combo', cb.qty), field('Preço unitário que entra no combo (R$)', cb.unit, 'Vale para qualquer produto cujo preço final (inclusive em promoção) seja exatamente este valor; pode misturar.'), field('Preço do combo (R$)', cb.price, 'Deve ser menor que quantidade × preço unitário.'),
      h('h3', {}, 'Combos adicionais'), exBox, addEx,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar'));
    const pf = pages.map(p => { const t = h('input', { type: 'text', value: p.title, maxlength: 120 }), b = h('textarea', { rows: 8, maxlength: 20000 }, p.body); return h('form', { class: 'form card', onsubmit: async ev => { ev.preventDefault(); try { await api('/api/admin/pages/' + p.slug, { method: 'PUT', body: { title: t.value, body: b.value } }); toast('Página salva.'); } catch (er) { toast(er.message, 'err'); } } }, h('h3', {}, p.slug), field('Título', t), field('Texto (modelo editável — revise juridicamente)', b), h('button', { class: 'btn', type: 'submit' }, 'Salvar página')); });
    out.replaceChildren(form, h('h2', {}, 'Páginas institucionais'), ...pf);
  } catch (er) { out.replaceChildren(errorBox(er.message)); }
}
async function auditPage(path, page = 1) {
  const out = h('div', {}, loading()); shell(path, h('h1', {}, 'Auditoria'), out);
  async function load(pg) { try { const r = await api('/api/admin/audit?page=' + pg); out.replaceChildren(tbl(['Quando', 'Ação', 'Entidade', 'Detalhes'], r.items.map(x => h('tr', {}, h('td', {}, fmtDate(x.created_at)), h('td', {}, x.action), h('td', {}, x.entity + (x.entity_id ? ' ' + String(x.entity_id).slice(0, 8) : '')), h('td', {}, x.details ? JSON.stringify(x.details).slice(0, 200) : '')))), pager({ ...r, pageSize: 30 }, load)); } catch (e) { out.replaceChildren(errorBox(e.message)); } } load(page);
}
export { $ };