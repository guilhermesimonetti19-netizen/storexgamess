import { h, a, money, fmtDate, mount, setPage, loading, errorBox, empty, toast, go, field, badge, STATUS, $ } from './ui.js';
import { api } from './api.js';
import { isLoggedIn } from './auth.js';

const NAV = [['/admin', 'Dashboard'], ['/admin/produtos', 'Produtos'], ['/admin/pedidos', 'Pedidos'], ['/admin/relatorios', 'Relatórios'], ['/admin/configuracoes', 'Configurações'], ['/admin/auditoria', 'Auditoria']];
const shell = (path, ...content) => mount(h('div', { class: 'wrap page admin' }, h('nav', { class: 'admin-nav', 'aria-label': 'Administração' }, NAV.map(([p, t]) => a(p, { 'aria-current': (p === '/admin' ? path === p : path.startsWith(p)) ? 'page' : null }, t))), h('section', { class: 'admin-main' }, content)));
const tbl = (cols, rows) => rows.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', { scope: 'col' }, c)))), h('tbody', {}, rows))) : empty('Nenhum registro.');
const pager = (r, fn) => h('nav', { class: 'pager' }, r.page > 1 && h('button', { class: 'btn', onclick: () => fn(r.page - 1) }, '←'), h('span', {}, `Página ${r.page} • ${r.total} registro(s)`), r.page * (r.pageSize || 20) < r.total && h('button', { class: 'btn', onclick: () => fn(r.page + 1) }, '→'));
const pct = (cur, prev) => (prev > 0 ? `${cur >= prev ? '+' : ''}${Math.round((cur - prev) / prev * 100)}% vs. período anterior` : 'Sem dados anteriores');
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
function bars(title, data, fmt = String) {
  const max = Math.max(1, ...data.map(d => d.v)); const W = Math.max(320, data.length * 36), H = 160, bw = Math.min(28, (W - 20) / Math.max(1, data.length) - 6); const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H + 22}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', title); svg.setAttribute('class', 'chart');
  const t = document.createElementNS(ns, 'title'); t.textContent = title; svg.append(t);
  data.forEach((d, i) => { const x = 10 + i * ((W - 20) / data.length), ht = Math.max(2, d.v / max * H); const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', x); r.setAttribute('y', H - ht); r.setAttribute('width', bw); r.setAttribute('height', ht); r.setAttribute('rx', 3); const tt = document.createElementNS(ns, 'title'); tt.textContent = `${d.l}: ${fmt(d.v)}`; r.append(tt); svg.append(r);
    if (data.length <= 16 || i % Math.ceil(data.length / 12) === 0) { const tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', x + bw / 2); tx.setAttribute('y', H + 15); tx.setAttribute('text-anchor', 'middle'); tx.textContent = d.l.slice(5); svg.append(tx); } });
  return h('figure', { class: 'card chart-card' }, h('figcaption', {}, title), data.length ? h('div', { class: 'chart-scroll' }, svg) : empty('Sem dados no período.'),
    data.length > 0 && h('details', {}, h('summary', {}, 'Ver em tabela'), tbl(['Item', 'Valor'], data.map(d => h('tr', {}, h('td', {}, d.l), h('td', {}, fmt(d.v)))))));
}
const hbars = (title, data, fmt) => h('figure', { class: 'card chart-card' }, h('figcaption', {}, title), data.length ? h('ul', { class: 'hbars' }, data.map(d => h('li', {}, h('span', {}, d.l), h('span', { class: 'hb', role: 'img', 'aria-label': `${d.l}: ${fmt(d.v)}` }, h('i', { style: `width:${Math.max(3, d.v / Math.max(1, ...data.map(x => x.v)) * 100)}%` })), h('b', {}, fmt(d.v))))) : empty('Sem dados no período.'));
const kpi = (label, value, sub) => h('div', { class: 'kpi' }, h('span', {}, label), h('strong', {}, value), sub && h('small', {}, sub));

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
      body.replaceChildren(
        h('div', { class: 'kpis' }, kpi('Faturamento bruto confirmado', money(k.gross_cents), pct(k.gross_cents, k.gross_prev_cents)), kpi('Valor líquido recebido', 'indisponível', d.net_note), kpi('Pedidos pagos', String(k.paid_orders), pct(k.paid_orders, k.paid_orders_prev)), kpi('Ticket médio', ticket === null ? '—' : money(ticket), 'Faturamento ÷ pedidos pagos'), kpi('Pedidos criados', String(k.orders_created), pct(k.orders_created, k.orders_created_prev)), kpi('Estornos (separados)', money(k.refunded_cents), `${k.refunded_orders} pedido(s)`), kpi('Vendas hoje', money(k.sales_today_cents)), kpi('Últimos 7 / 30 dias', `${money(k.sales_7d_cents)} / ${money(k.sales_30d_cents)}`), kpi('Clientes', String(c.total), `${c.new} novo(s) • ${c.buyers} já compraram`), kpi('Produtos', `${p.active} ativos`, `${p.inactive} inativos • ${p.featured} em destaque`), kpi('Aguardando pagamento', String(cnt('pending'))), kpi('Em atendimento / concluídos', `${cnt('in_delivery')} / ${cnt('completed')}`, `Cancelados ${cnt('cancelled')} • Expirados ${cnt('expired')}`)),
        h('section', { class: 'card attention' }, h('h2', {}, 'Precisa de atenção'), alerts.length ? h('ul', {}, alerts) : empty('Nada pendente.')),
        h('div', { class: 'charts' }, bars('Faturamento confirmado por ' + ({ day: 'dia', week: 'semana', month: 'mês' })[bucket] + ' (R$)', d.revenue_series.map(x => ({ l: x.d, v: x.cents / 100 })), v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })), hbars('Pedidos por status', d.orders_by_status.map(x => ({ l: STATUS[x.status] || x.status, v: x.count })), String), hbars('Vendas por categoria (R$)', d.by_category.map(x => ({ l: x.category, v: x.cents / 100 })), v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })), bars('Novos clientes', d.customers_series.map(x => ({ l: x.d, v: x.n })))),
        h('section', {}, h('h2', {}, 'Produtos mais vendidos'), tbl(['Produto', 'Qtd', 'Faturamento'], d.top_products.map(t => h('tr', {}, h('td', {}, t.name), h('td', {}, t.qty), h('td', {}, money(t.cents)))))),
        h('section', {}, h('h2', {}, 'Pedidos recentes'), tbl(['Pedido', 'Data', 'Total', 'Pagamento', 'Entrega', ''], d.recent_orders.map(o => h('tr', {}, h('td', {}, o.public_ref), h('td', {}, fmtDate(o.created_at)), h('td', {}, money(o.total_cents)), h('td', {}, badge(o.payment_status)), h('td', {}, badge(o.delivery_status)), h('td', {}, a('/admin/pedidos/' + o.id, { class: 'btn' }, 'Abrir')))))), total === 0 && empty('Sem pedidos no período.'));
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
  setPage(id ? 'Editar produto' : 'Novo produto', { noindex: true }); const out = h('div', {}, loading()); shell(path, h('h1', {}, id ? 'Editar produto' : 'Novo produto'), out);
  try {
    const [cats, p] = await Promise.all([api('/api/admin/categories'), id ? api('/api/admin/products/' + id) : Promise.resolve({ delivery: {}, images: [], is_active: false, max_per_order: 1 })]); const d = p.delivery || {};
    const inp = (k, o = {}) => h('input', { type: 'text', value: p[k] ?? '', ...o }), ta = (v, rows = 3, max) => h('textarea', { rows, maxlength: max }, v ?? '');
    const f = { name: inp('name', { required: true, maxlength: 140 }), slug: inp('slug', { maxlength: 120, placeholder: 'gerado do nome' }), short: ta(p.short_description, 2, 300), long: ta(p.long_description, 5, 8000), platform: inp('platform', { maxlength: 60 }), cat: h('select', {}, h('option', { value: '' }, 'Sem categoria'), cats.map(c => h('option', { value: c.id, selected: c.id === p.category_id }, c.name))),
      price: h('input', { type: 'number', step: '0.01', min: '0.01', required: true, value: p.price_cents ? (p.price_cents / 100).toFixed(2) : '' }), promo: h('input', { type: 'number', step: '0.01', min: '0.01', value: p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : '' }),
      track: h('input', { type: 'checkbox', checked: p.track_stock }), stock: h('input', { type: 'number', min: 0, value: p.stock ?? 0 }), maxq: h('input', { type: 'number', min: 1, max: 10, value: p.max_per_order || 1 }), active: h('input', { type: 'checkbox', checked: p.is_active }), feat: h('input', { type: 'checkbox', checked: p.is_featured }), isnew: h('input', { type: 'checkbox', checked: p.is_new }),
      region: inp('region'), edition: inp('edition'), req: ta(p.requirements, 2, 1000), terms: ta(p.specific_terms, 2, 2000),
      ins: ta(d.instructions, 4, 4000), steps: ta(d.steps, 3, 2000), need: ta(d.required_info, 2, 1000), eta: h('input', { type: 'text', maxlength: 200, value: d.eta_text ?? '' }), notes: ta(d.notes, 2, 1000), wa: ta(d.whatsapp_message, 2, 500) };
    const cents = v => (v === '' ? null : Math.round(Number(v) * 100)); const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar');
    const form = h('form', { class: 'form card', onsubmit: async e => { e.preventDefault(); save.disabled = true;
      const body = { name: f.name.value, slug: f.slug.value || undefined, short_description: f.short.value, long_description: f.long.value, platform: f.platform.value, category_id: f.cat.value || null, price_cents: cents(f.price.value), promo_price_cents: cents(f.promo.value), track_stock: f.track.checked, stock: f.track.checked ? Number(f.stock.value) : null, max_per_order: Number(f.maxq.value), is_active: f.active.checked, is_featured: f.feat.checked, is_new: f.isnew.checked, region: f.region.value, edition: f.edition.value, requirements: f.req.value, specific_terms: f.terms.value, delivery: { instructions: f.ins.value, steps: f.steps.value, required_info: f.need.value, eta_text: f.eta.value, notes: f.notes.value, whatsapp_message: f.wa.value } };
      try { if (id) { await api('/api/admin/products/' + id, { method: 'PATCH', body }); toast('Produto salvo.'); } else { const r = await api('/api/admin/products', { method: 'POST', body }); toast('Produto criado. Agora adicione imagens.'); go('/admin/produtos/' + r.id); } } catch (er) { toast(er.message, 'err'); } save.disabled = false; } },
      field('Nome', f.name), field('Slug (URL)', f.slug), field('Descrição curta', f.short), field('Descrição completa', f.long), field('Plataforma', f.platform), field('Categoria', f.cat), field('Preço (R$)', f.price), field('Preço promocional (R$, opcional)', f.promo, 'Deve ser menor que o preço.'),
      h('label', { class: 'check' }, f.track, ' Controlar estoque'), field('Estoque', f.stock), field('Máx. por pedido (1–10)', f.maxq), h('label', { class: 'check' }, f.active, ' Ativo (visível na loja)'), h('label', { class: 'check' }, f.feat, ' Destaque'), h('label', { class: 'check' }, f.isnew, ' Novidade'),
      field('Região (opcional)', f.region), field('Edição (opcional)', f.edition), field('Requisitos (opcional)', f.req), field('Termos específicos (opcional)', f.terms),
      h('h2', {}, 'Instruções pós-compra (privadas — só aparecem ao cliente após pagamento confirmado)'), field('Instruções', f.ins), field('Passos', f.steps), field('Dados que o cliente deve informar', f.need), field('Prazo estimado', f.eta), field('Observações', f.notes), field('Mensagem inicial do WhatsApp (opcional)', f.wa), save);
    const imgs = id ? h('section', { class: 'card' }, h('h2', {}, 'Imagens'), h('div', { class: 'img-list' }, p.images.map(i => h('figure', {}, h('img', { src: i.url, alt: 'Imagem do produto', loading: 'lazy' }), h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { if (confirm('Remover imagem?')) { try { await api(`/api/admin/products/${id}/images/${i.id}`, { method: 'DELETE' }); productForm(path, id); } catch (er) { toast(er.message, 'err'); } } } }, 'Remover')))), h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Enviar imagem', onchange: async e => { const file = e.target.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) return toast('Máximo 2 MB.', 'err'); try { await api(`/api/admin/products/${id}/images`, { method: 'POST', raw: file, contentType: file.type }); toast('Imagem enviada.'); productForm(path, id); } catch (er) { toast(er.message, 'err'); } } }), h('small', {}, 'PNG, JPG ou WebP até 2 MB. A primeira imagem é a principal.')) : h('p', { class: 'note' }, 'Salve o produto para enviar imagens.');
    const del = id && h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (confirm('Excluir/arquivar este produto? Se já foi vendido, ele será apenas arquivado.')) { try { await api('/api/admin/products/' + id, { method: 'DELETE' }); toast('Produto removido.'); go('/admin/produtos'); } catch (er) { toast(er.message, 'err'); } } } }, 'Excluir / arquivar');
    out.replaceChildren(form, imgs, del);
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
      h('dl', { class: 'specs' }, [['Referência InfinitePay (order_nsu)', o.order_nsu], ['Transação', o.transaction_nsu || '—'], ['Pago em', fmtDate(o.paid_at)], ['Valor pago (c/ taxas do cliente)', o.paid_amount_cents ? money(o.paid_amount_cents) : '—'], ['Método', o.payment_method || '—'], ['Cliente abriu o botão do WhatsApp', o.whatsapp_link_opened_at ? fmtDate(o.whatsapp_link_opened_at) : 'não registrado']].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
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
    const form = h('form', { class: 'form card', onsubmit: async ev => { ev.preventDefault(); try { await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.value])) }); toast('Configurações salvas.'); } catch (er) { toast(er.message, 'err'); } } }, field('Nome da loja', e.store_name), field('WhatsApp oficial (só dígitos, com DDI)', e.whatsapp_number, 'Ex.: 5511999999999'), field('Mensagem inicial do WhatsApp', e.whatsapp_message, 'Use {pedido} onde o código do pedido deve entrar.'), field('Texto de suporte (rodapé)', e.support_text), field('Instagram (URL https)', e.instagram_url), field('Alerta: pedido pendente após (horas)', e.alert_pending_hours), field('Alerta: estoque baixo até (unidades)', e.alert_low_stock), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar'));
    const pf = pages.map(p => { const t = h('input', { type: 'text', value: p.title, maxlength: 120 }), b = h('textarea', { rows: 8, maxlength: 20000 }, p.body); return h('form', { class: 'form card', onsubmit: async ev => { ev.preventDefault(); try { await api('/api/admin/pages/' + p.slug, { method: 'PUT', body: { title: t.value, body: b.value } }); toast('Página salva.'); } catch (er) { toast(er.message, 'err'); } } }, h('h3', {}, p.slug), field('Título', t), field('Texto (modelo editável — revise juridicamente)', b), h('button', { class: 'btn', type: 'submit' }, 'Salvar página')); });
    out.replaceChildren(form, h('h2', {}, 'Páginas institucionais'), ...pf);
  } catch (er) { out.replaceChildren(errorBox(er.message)); }
}
async function auditPage(path, page = 1) {
  const out = h('div', {}, loading()); shell(path, h('h1', {}, 'Auditoria'), out);
  async function load(pg) { try { const r = await api('/api/admin/audit?page=' + pg); out.replaceChildren(tbl(['Quando', 'Ação', 'Entidade', 'Detalhes'], r.items.map(x => h('tr', {}, h('td', {}, fmtDate(x.created_at)), h('td', {}, x.action), h('td', {}, x.entity + (x.entity_id ? ' ' + String(x.entity_id).slice(0, 8) : '')), h('td', {}, x.details ? JSON.stringify(x.details).slice(0, 200) : '')))), pager({ ...r, pageSize: 30 }, load)); } catch (e) { out.replaceChildren(errorBox(e.message)); } } load(page);
}
export { $ };
