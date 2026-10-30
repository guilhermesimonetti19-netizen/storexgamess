import { h, a, icon, money, fmtDate, mount, setPage, loading, errorBox, empty, toast, go, field, badge, STATUS, $ } from './ui.js';
import { api } from './api.js';
import { isLoggedIn } from './auth.js';

const NAV = [['/admin', 'Dashboard', 'bolt'], ['/admin/produtos', 'Produtos', 'package'], ['/admin/pedidos', 'Pedidos', 'receipt'], ['/admin/relatorios', 'Relatórios', 'tag'], ['/admin/configuracoes', 'Configurações', 'key'], ['/admin/auditoria', 'Auditoria', 'clock']];
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
  if (path === '/admin/produtos') return products(path);
  if (path === '/admin/produtos/novo') return productForm(path, null);
  if ((m = path.match(/^\/admin\/produtos\/([0-9a-f-]{36})$/))) return productForm(path, m[1]);
  if (path === '/admin/pedidos') return orders(path);
  if ((m = path.match(/^\/admin\/pedidos\/([0-9a-f-]{36})$/))) return orderDetail(path, m[1]);
  if (path === '/admin/relatorios') return reports(path);
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
        h('div', { class: 'charts' },
          lineChart('Faturamento por ' + ({ day: 'dia', week: 'semana', month: 'mês' })[bucket] + ' (R$)', d.revenue_series.map(x => ({ l: x.d, v: x.cents / 100 })), R),
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

async function products(path, page = 1) {
  const out = h('div', {}, loading()); const q = h('input', { type: 'search', placeholder: 'Buscar produto' });
  shell(path, h('h1', {}, 'Produtos'), h('div', { class: 'row' }, a('/admin/produtos/novo', { class: 'btn btn-primary' }, 'Novo produto'), h('form', { onsubmit: e => { e.preventDefault(); load(1); } }, q, h('button', { class: 'btn', type: 'submit' }, 'Buscar'))), out);
  async function load(pg) { try { const r = await api(`/api/admin/products?page=${pg}&q=${encodeURIComponent(q.value)}`); out.replaceChildren(tbl(['Nome', 'Plataforma', 'Preço', 'Estoque', 'Status', ''], r.items.map(p => h('tr', {}, h('td', {}, p.name), h('td', {}, p.platform || '—'), h('td', {}, money(p.price_cents), p.promo_price_cents && ` (promo ${money(p.promo_price_cents)})`), h('td', {}, p.track_stock ? p.stock : '—'), h('td', {}, p.is_active ? 'Ativo' : 'Inativo'), h('td', {}, a('/admin/produtos/' + p.id, { class: 'btn' }, 'Editar')))), pager(r, load))); out.append(pager({ ...r, pageSize: 20 }, load)); } catch (e) { out.replaceChildren(errorBox(e.message, () => load(pg))); } }
  load(page);
}

async function productForm(path, id) {
  setPage(id ? 'Editar produto' : 'Novo produto', { noindex: true });
  const out = h('div', {}, loading()); shell(path, h('h1', {}, id ? 'Editar produto' : 'Novo produto'), out);
  try {
    const [cats, p] = await Promise.all([api('/api/admin/categories'), id ? api('/api/admin/products/' + id) : Promise.resolve({ delivery: {}, images: [], is_active: true, is_new: true, max_per_order: 2 })]);
    const inp = (k, o = {}) => h('input', { type: 'text', value: p[k] ?? '', ...o }), ta = (v, rows, max) => h('textarea', { rows, maxlength: max }, v ?? '');
    const chk = (c, t) => h('label', { class: 'check' }, c, ' ' + t), cents = v => (v === '' ? null : Math.round(Number(v) * 100));
    const f = { name: inp('name', { required: true, maxlength: 140 }), slug: inp('slug', { maxlength: 120, placeholder: 'gerado do nome' }), long: ta(p.long_description || p.short_description, 5, 8000), platform: inp('platform', { maxlength: 60 }),
      cat: h('select', {}, h('option', { value: '' }, 'Sem categoria'), cats.map(c => h('option', { value: c.id, selected: c.id === p.category_id }, c.name))),
      price: h('input', { type: 'number', step: '0.01', min: '0.01', required: true, value: p.price_cents ? (p.price_cents / 100).toFixed(2) : '' }), promo: h('input', { type: 'number', step: '0.01', min: '0.01', value: p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : '' }),
      track: h('input', { type: 'checkbox', checked: p.track_stock }), stock: h('input', { type: 'number', min: 0, value: p.stock ?? 0 }), maxq: h('input', { type: 'number', min: 1, max: 10, value: p.max_per_order || 1 }),
      active: h('input', { type: 'checkbox', checked: p.is_active }), feat: h('input', { type: 'checkbox', checked: p.is_featured }), isnew: h('input', { type: 'checkbox', checked: p.is_new }),
      region: inp('region'), edition: inp('edition'), req: ta(p.requirements, 2, 1000), terms: ta(p.specific_terms, 2, 2000), ins: ta((p.delivery || {}).instructions, 5, 4000) };
    // ---- modelos rápidos (só no cadastro) ----
    const PRESETS = [['Jogo Xbox · R$ 30', 'jogos-videogames', 'Xbox', '30.00'], ['Jogo Steam', 'jogos-pc-steam', 'Steam', '7.90'], ['Pack / assinatura', 'packs-assinaturas', '', '']];
    const presets = !id && h('div', { class: 'presets' }, h('strong', {}, 'Modelo rápido:'), PRESETS.map(([t, slug, plat, price]) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { f.cat.value = cats.find(c => c.slug === slug)?.id || ''; f.platform.value = plat; f.price.value = price; f.maxq.value = 2; f.active.checked = true; f.isnew.checked = true; f.name.focus(); } }, t)));
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
      const body = { name: f.name.value, slug: f.slug.value || undefined, long_description: f.long.value, platform: f.platform.value, category_id: f.cat.value || null, price_cents: cents(f.price.value), promo_price_cents: cents(f.promo.value), track_stock: f.track.checked, stock: f.track.checked ? Number(f.stock.value) : null, max_per_order: Number(f.maxq.value), is_active: f.active.checked, is_featured: f.feat.checked, is_new: f.isnew.checked, region: f.region.value, edition: f.edition.value, requirements: f.req.value, specific_terms: f.terms.value, delivery: { instructions: f.ins.value } };
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
      h('div', { class: 'form-grid' }, field('Nome', f.name), field('Plataforma', f.platform), field('Categoria', f.cat), field('Slug (URL)', f.slug), field('Preço (R$)', f.price), field('Preço promocional (R$, opcional)', f.promo, 'Deve ser menor que o preço.')),
      field('Descrição', f.long),
      h('div', { class: 'form-grid' }, field('Máx. por pedido (1–10)', f.maxq, 'Para o combo "2 por R$ 45" num mesmo produto, use 2 ou mais.'), field('Estoque', f.stock)),
      h('div', { class: 'row' }, chk(f.active, 'Ativo (visível)'), chk(f.feat, 'Destaque'), chk(f.isnew, 'Novidade'), chk(f.track, 'Controlar estoque')),
      h('h2', {}, 'Imagens'), zone, list,
      h('h2', {}, 'Instruções pós-compra'), h('p', { class: 'note' }, 'Privadas: o cliente só vê depois do pagamento confirmado.'), f.ins,
      h('details', {}, h('summary', {}, 'Mais opções (região, edição, requisitos, termos)'), field('Região', f.region), field('Edição', f.edition), field('Requisitos', f.req), field('Termos específicos', f.terms)),
      h('div', { class: 'row' }, save, again));
    const del = id && h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (confirm('Excluir/arquivar este produto? Se já foi vendido, ele será apenas arquivado.')) { try { await api('/api/admin/products/' + id, { method: 'DELETE' }); toast('Produto removido.'); go('/admin/produtos'); } catch (er) { toast(er.message, 'err'); } } } }, 'Excluir / arquivar');
    out.replaceChildren(...[presets, form, del].filter(Boolean));
  } catch (e) { out.replaceChildren(errorBox(e.message)); }
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
    out.replaceChildren(h('h1', {}, 'Pedido ' + o.public_ref), h('p', {}, badge(o.payment_status), ' ', badge(o.delivery_status), ' • ', fmtDate(o.created_at), ' • ', h('strong', {}, money(o.total_cents))),
      h('dl', { class: 'specs' }, [['Referência InfinitePay (order_nsu)', o.order_nsu], ['Transação', o.transaction_nsu || '—'], ['Pago em', fmtDate(o.paid_at)], ['Desconto combo', o.discount_cents ? '-' + money(o.discount_cents) : '—'], ['Valor pago (c/ taxas do cliente)', o.paid_amount_cents ? money(o.paid_amount_cents) : '—'], ['Método', o.payment_method || '—'], ['Cliente abriu o botão do WhatsApp', o.whatsapp_link_opened_at ? fmtDate(o.whatsapp_link_opened_at) : 'não registrado']].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      tbl(['Item', 'Qtd', 'Unitário', 'Subtotal'], o.items.map(i => h('tr', {}, h('td', {}, i.name_snapshot), h('td', {}, i.quantity), h('td', {}, money(i.unit_price_cents)), h('td', {}, money(i.subtotal_cents))))),
      h('div', { class: 'row' }, o.payment_status === 'pending' && act('Reconciliar com a InfinitePay', async () => { const r = await api(`/api/admin/orders/${id}/reconcile`, { method: 'POST' }); toast(r.paid ? 'Pagamento confirmado.' : 'Ainda não consta como pago.'); }), o.payment_status === 'paid' && o.delivery_status !== 'delivered' && act('Marcar como entregue', () => api('/api/admin/orders/' + id, { method: 'PATCH', body: { delivery_status: 'delivered', status: 'completed' } }), 'btn btn-primary'), o.payment_status === 'paid' && o.status === 'paid' && act('Em atendimento', () => api('/api/admin/orders/' + id, { method: 'PATCH', body: { status: 'in_delivery' } })), o.payment_status === 'pending' && act('Cancelar pedido', () => api('/api/admin/orders/' + id, { method: 'PATCH', body: { status: 'cancelled' } }), 'btn btn-danger'),
        o.payment_status === 'paid' && act('Registrar estorno (exceção)', async () => { const j = prompt('ATENÇÃO: registre isto só depois de estornar no app da InfinitePay. Justificativa (mín. 10 caracteres):'); if (j) await api(`/api/admin/orders/${id}/flag-refund`, { method: 'POST', body: { justification: j } }); }, 'btn btn-danger')),
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
async function settingsPage(path) {
  const out = h('div', {}, loading()); shell(path, h('h1', {}, 'Configurações'), out);
  try {
    const { settings: s, pages } = await api('/api/admin/settings'); const i = (k, o = {}) => h('input', { type: 'text', value: s[k] ?? '', ...o }); const e = { store_name: i('store_name', { maxlength: 80 }), whatsapp_number: i('whatsapp_number', { inputmode: 'numeric', placeholder: '5511999999999' }), whatsapp_message: h('textarea', { rows: 3, maxlength: 500 }, s.whatsapp_message ?? ''), support_text: i('support_text', { maxlength: 200 }), instagram_url: i('instagram_url', { placeholder: 'https://instagram.com/…' }), alert_pending_hours: i('alert_pending_hours', { inputmode: 'numeric' }), alert_low_stock: i('alert_low_stock', { inputmode: 'numeric' }) };
    const cb = { en: h('input', { type: 'checkbox', checked: s.combo_enabled === '1' }), qty: h('input', { type: 'number', min: 2, max: 10, value: s.combo_qty || 2 }), unit: h('input', { type: 'number', step: '0.01', min: '0.01', value: ((Number(s.combo_unit_cents) || 3000) / 100).toFixed(2) }), price: h('input', { type: 'number', step: '0.01', min: '0.01', value: ((Number(s.combo_price_cents) || 4500) / 100).toFixed(2) }) };
    const c100 = v => String(Math.round(Number(v) * 100));
    const form = h('form', { class: 'form card', onsubmit: async ev => { ev.preventDefault(); try { await api('/api/admin/settings', { method: 'PUT', body: { ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.value])), combo_enabled: cb.en.checked ? '1' : '0', combo_qty: cb.qty.value, combo_unit_cents: c100(cb.unit.value), combo_price_cents: c100(cb.price.value) } }); toast('Configurações salvas.'); } catch (er) { toast(er.message, 'err'); } } }, field('Nome da loja', e.store_name), field('WhatsApp oficial (só dígitos, com DDI)', e.whatsapp_number, 'Ex.: 5511999999999'), field('Mensagem inicial do WhatsApp', e.whatsapp_message, 'Use {pedido} onde o código do pedido deve entrar.'), field('Texto de suporte (rodapé)', e.support_text), field('Instagram (URL https)', e.instagram_url), field('Alerta: pedido pendente após (horas)', e.alert_pending_hours), field('Alerta: estoque baixo até (unidades)', e.alert_low_stock),
      h('h2', {}, 'Combo promocional'), h('label', { class: 'check' }, cb.en, ' Combo ativo'), field('Quantidade do combo', cb.qty), field('Preço unitário que entra no combo (R$)', cb.unit, 'Vale para qualquer produto cujo preço final (inclusive em promoção) seja exatamente este valor; pode misturar.'), field('Preço do combo (R$)', cb.price, 'Deve ser menor que quantidade × preço unitário.'),
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