import {
  h,
  a,
  money,
  mount,
  setPage,
  loading,
  errorBox,
  empty,
  toast,
  go,
  imgOrPlaceholder,
  badge,
  $,
  icon,
  observeReveal,
  skeletonGrid,
  emptyArt,
} from "./ui.js";
import { api, settings } from "./api.js";
import {
  addToCart,
  getCart,
  setQty,
  removeItem,
  clearCart,
  idempotencyKey,
} from "./cart.js";
import { isLoggedIn } from "./auth.js";
import { comboCfg, comboDiscount } from "./combo.js";

const T = (tag, cls, ...k) => h(tag, { class: cls }, ...k);
export function priceBlock(p) {
  return h(
    "div",
    { class: "price" },
    p.promo_active_cents
      ? [
          h("s", {}, money(p.price_cents)),
          h("strong", {}, money(p.promo_active_cents)),
        ]
      : h("strong", {}, money(p.price_cents)),
  );
}
const off = (p) =>
  p.promo_active_cents
    ? Math.round((1 - p.promo_active_cents / p.price_cents) * 100)
    : 0;
export const productCard = (p) => {
  const canBuy = p.in_stock !== false;
  const max = Math.min(p.max_per_order || 1, p.track_stock ? p.stock || 0 : 10);
  return h(
    "article",
    { class: "pcard reveal" },
    a(
      "/produto/" + p.slug,
      { class: "pc-link", "aria-label": p.name },
      h(
        "div",
        { class: "pc-media" },
        imgOrPlaceholder(p.image_url, "", "pc-img"),
        h(
          "div",
          { class: "pc-badges" },
          off(p) > 0 && h("span", { class: "bdg bdg-off" }, `-${off(p)}%`),
          p.is_new && h("span", { class: "bdg bdg-new" }, "Novo"),
          !canBuy && h("span", { class: "bdg bdg-out" }, "Indisponível"),
        ),
      ),
      h(
        "div",
        { class: "pc-body" },
        p.platform && h("span", { class: "tag" }, p.platform),
        ...(p.xbox_versions || []).map((v) => h("span", { class: "tag" }, v)),
        h("h3", {}, p.name),
        priceBlock(p),
      ),
    ),
    canBuy &&
      h(
        "button",
        {
          class: "pc-add",
          type: "button",
          "aria-label": "Adicionar " + p.name + " ao carrinho",
          onclick: (e) => {
            addToCart(p.id, 1, max);
            toast("Adicionado ao carrinho.");
            const b = e.currentTarget;
            b.classList.add("done");
            setTimeout(() => b.classList.remove("done"), 1200);
          },
        },
        icon("plus", { size: 20, cls: "i-plus" }),
        icon("check", { size: 20, cls: "i-ok" }),
      ),
  );
};
function rail(items) {
  // carrossel com setas e snap
  const track = h("div", { class: "rail-track" }, items.map(productCard));
  const go2 = (d) =>
    track.scrollBy({
      left: d * Math.max(260, track.clientWidth * 0.85),
      behavior: "smooth",
    });
  const w = h(
    "div",
    { class: "rail" },
    h(
      "button",
      {
        class: "rail-btn prev",
        type: "button",
        "aria-label": "Anterior",
        onclick: () => go2(-1),
      },
      icon("back", { size: 20 }),
    ),
    track,
    h(
      "button",
      {
        class: "rail-btn next",
        type: "button",
        "aria-label": "Próximo",
        onclick: () => go2(1),
      },
      icon("arrow", { size: 20 }),
    ),
  );
  if ("ResizeObserver" in window)
    new ResizeObserver(() =>
      w.classList.toggle(
        "no-scroll",
        track.scrollWidth <= track.clientWidth + 2,
      ),
    ).observe(track);
  return w;
}

const TILES = [
  {
    slug: "jogos-videogames",
    img: "card-xbox",
    alt: "Xbox: jogos para Xbox One, Xbox Series X|S e Xbox 360. Acessar categoria.",
    w: 296,
  },
  {
    slug: "jogos-pc-steam",
    img: "card-steam",
    alt: "Steam: jogos para PC com os melhores preços. Acessar categoria.",
    w: 282,
  },
  {
    slug: "packs-assinaturas",
    img: "card-packs",
    alt: "Packs e assinaturas: streaming, ferramentas de IA, cursos e serviços digitais. Acessar categoria.",
    w: 301,
  },
];
const STEPS = [
  [
    "search",
    "Escolha o produto",
    "Navegue pelo catálogo e adicione ao carrinho.",
  ],
  [
    "lock",
    "Pague com segurança",
    "Finalize no checkout hospedado da InfinitePay.",
  ],
  [
    "receipt",
    "Receba as instruções",
    "Após a confirmação do pagamento, elas aparecem no seu pedido.",
  ],
  [
    "whatsapp",
    "Conte com o suporte",
    "Dúvidas? Fale com a gente no WhatsApp.",
  ],
];
const FAQ = [
  [
    "Como funcionam os jogos de Xbox One e Xbox Series X|S?",
    "Os jogos funcionam por meio dos métodos Parental ou DNS, dependendo do título adquirido. Alguns jogos permitem jogar online, enquanto outros funcionam apenas offline. Consulte a descrição de cada anúncio para verificar as condições específicas do jogo.",
  ],
  [
    "O acesso aos jogos é vitalício?",
    "Sim! O acesso aos jogos adquiridos é vitalício!",
  ],
  [
    "Vocês oferecem suporte durante ou após a compra?",
    "Sim! Oferecemos suporte durante e após a compra. Nosso atendimento é feito pelo WhatsApp. Basta clicar na opção “Suporte” disponível em nosso site para ser direcionado diretamente ao nosso atendimento.",
  ],
  [
    "Como funcionam os jogos da Steam?",
    "Após a confirmação do pagamento, você receberá uma conta com login e senha para acessar a Steam. Essa conta terá acesso ao jogo adquirido e é compartilhada. Não é necessário realizar nenhum método ou configuração especial: basta deixar a Steam no modo offline para jogar.",
  ],
  [
    "A StoreXGames é confiável?",
    "Sim! Trabalhamos para oferecer uma experiência de compra segura e um bom atendimento aos nossos clientes. Se ainda tiver dúvidas, confira os depoimentos e avaliações de compradores nos destaques “Clientes” do nosso Instagram @storexgamess",
  ],
  [
    "Todos os produtos têm entrega automática?",
    "Sim! Todos os produtos possuem entrega automática de mensagem ou do próprio produto. Porém, alguns jogos de Xbox exigem aprovação manual para liberar o acesso ou adicionar a conta ao console, principalmente os lançamentos de 2026 em diante.",
  ],
];
function initCategoryCarousel(tiles) {
  if (!tiles) return;

  const mobile = window.matchMedia("(max-width: 767px)");

  if (!mobile.matches) return;

  const cards = [...tiles.querySelectorAll(".tile")];

  if (cards.length <= 1) return;

  let timer;

  function goTo(index) {
    const card = cards[index];

    const position =
      card.offsetLeft -
      tiles.offsetLeft -
      (tiles.clientWidth - card.clientWidth) / 2;

    tiles.scrollTo({
      left: position,
      behavior: "smooth",
    });
  }

  function getCurrentIndex() {
    const center = tiles.getBoundingClientRect().left + tiles.clientWidth / 2;

    return cards.reduce(
      (best, card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - center);

        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Infinity },
    ).index;
  }

  function startAutoplay() {
    clearInterval(timer);

    timer = setInterval(() => {
      if (!tiles.isConnected) {
        clearInterval(timer);
        return;
      }

      if (!mobile.matches) {
        clearInterval(timer);
        return;
      }

      const current = getCurrentIndex();
      const next = (current + 1) % cards.length;

      goTo(next);
    }, 4000);
  }

  // Permite interação manual sem conflito com o autoplay
  tiles.addEventListener("pointerdown", () => {
    clearInterval(timer);
  });

  tiles.addEventListener("pointerup", startAutoplay);
  tiles.addEventListener("pointercancel", startAutoplay);

  startAutoplay();
}
function tilt(el) {
  // inclinação 3D suave (só mouse, sem movimento reduzido)
  if (
    !el ||
    matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches
  )
    return;
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width - 0.5,
      y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", (x * 7).toFixed(2) + "deg");
    el.style.setProperty("--rx", (-y * 6).toFixed(2) + "deg");
  });
  el.addEventListener("pointerleave", () => {
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  });
}
function parallax(el) {
  // camadas com profundidade seguindo o mouse
  if (
    !el ||
    matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches
  )
    return;
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty(
      "--mx",
      (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3),
    );
    el.style.setProperty(
      "--my",
      (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3),
    );
  });
  el.addEventListener("pointerleave", () => {
    el.style.setProperty("--mx", 0);
    el.style.setProperty("--my", 0);
  });
}
async function strip(title, eyebrow, query, link) {
  try {
    const r = await api("/api/products?pageSize=10&" + query, { auth: false });
    if (!r.items.length) return null;
    return h(
      "section",
      { class: "section wrap" },
      secHead(
        eyebrow,
        title,
        link &&
          a(link, { class: "more" }, "Ver todos", icon("right", { size: 18 })),
      ),
      rail(r.items),
    );
  } catch {
    return null;
  }
}
const secHead = (eyebrow, title, extra) =>
  h(
    "header",
    { class: "sec-head reveal" },
    h("div", {}, h("span", { class: "eyebrow" }, eyebrow), h("h2", {}, title)),
    extra,
  );

export async function home() {
  setPage("", {
    desc: "StoreX Games: jogos para Xbox, PC / Steam, packs e assinaturas digitais. Checkout seguro e atendimento via WhatsApp.",
  });
  const st = await settings();
  const waNum = String(st.whatsapp_number || "").replace(/\D/g, "");
  const wa = waNum.length >= 10 ? "https://wa.me/" + waNum : null;
  const suit = (n, c) =>
    h(
      "span",
      { class: "suit " + c, "aria-hidden": "true" },
      icon(n, { size: 30 }),
    );
  const frame = h(
    "div",
    { class: "frame" },
    h("img", {
      src: "/assets/banner.webp",
      alt: "StoreX Games: o mascote dado em um trono de terno roxo, com controle e dinheiro. Jogos, assinaturas e serviços digitais.",
      width: 900,
      height: 535,
      fetchpriority: "high",
    }),
  );
  const chip = (cls, ic, t) =>
    h(
      "span",
      { class: "chip-f " + cls, "aria-hidden": "true" },
      icon(ic, { size: 18 }),
      t,
    );
  const sparks = h(
    "div",
    { class: "sparks", "aria-hidden": "true" },
    Array.from({ length: 14 }, (_, i) =>
      h("i", {
        style: `--x:${(i * 37 + 8) % 96}%;--y:${(i * 53 + 10) % 90}%;--t:${(i % 7) * 0.7}s`,
      }),
    ),
  );
  const stage = h(
    "div",
    { class: "wrap stage" },
    h(
      "div",
      { class: "stage-art" },
      frame,
      chip("cf1", "gamepad", "Jogos digitais"),
      chip("cf2", "gift", "Packs e assinaturas"),
      chip("cf3", "bolt", "Pedido acompanhado"),
    ),
    h(
      "div",
      { class: "stage-copy" },
      h(
        "span",
        { class: "eyebrow pill" },
        icon("bolt", { size: 16 }),
        "Loja de jogos e serviços digitais",
      ),
      h(
        "h1",
        {},
        "Seu próximo jogo começa ",
        h("span", { class: "grad" }, "aqui"),
      ),
      h(
        "p",
        { class: "lead" },
        "Escolha, pague no checkout seguro e receba as instruções direto no seu pedido, com suporte pelo WhatsApp.",
      ),
      h(
        "div",
        { class: "cta-row" },
        a(
          "/produtos",
          { class: "btn btn-primary btn-lg" },
          "Ver catálogo",
          icon("arrow", { size: 20 }),
        ),
        wa &&
          h(
            "a",
            {
              class: "btn btn-lg",
              href: wa,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            icon("whatsapp", { size: 20 }),
            "Falar no WhatsApp",
          ),
      ),
      h(
        "ul",
        { class: "hero-points" },
        [
          ["shield", "Pagamento seguro"],
          ["whatsapp", "Entrega automática"],
          ["headset", "Suporte humano"],
        ].map(([i, t]) => h("li", {}, icon(i, { size: 18 }), t)),
      ),
    ),
  );
  const root = h(
    "div",
    { class: "home" },
    h(
      "section",
      { class: "hero", "aria-label": "Apresentação" },
      h(
        "div",
        { class: "aurora", "aria-hidden": "true" },
        h("i"),
        h("i"),
        h("i"),
      ),
      h("div", { class: "hero-grid-bg", "aria-hidden": "true" }),
      h("div", { class: "beam", "aria-hidden": "true" }),
      sparks,
      suit("spade", "s1"),
      suit("diamond", "s2"),
      suit("club", "s3"),
      suit("dice", "s4"),
      stage,
    ),
    h(
      "section",
      { class: "wrap trust" },
      [
        ["shield", "Checkout seguro", "Pagamento processado pela InfinitePay."],
        [
          "receipt",
          "Pedido acompanhado",
          "Veja status e instruções na sua conta.",
        ],
        [
          "whatsapp",
          "Entrega automática",
          "Receba seu produto após o pagamento.",
        ],
        [
          "lock",
          "Liberação protegida",
          "Instruções só após o pagamento confirmado.",
        ],
      ].map(([i, t, d], n) =>
        h(
          "div",
          { class: "trust-item reveal", style: `--d:${n * 80}ms` },
          h("span", { class: "ti-ic" }, icon(i, { size: 24 })),
          h("div", {}, h("strong", {}, t), h("small", {}, d)),
        ),
      ),
    ),
    h(
      "section",
      { class: "section wrap cats-sec", "aria-labelledby": "cats-h" },
      secHead("Escolha sua plataforma", "Categorias"),
      h(
        "div",
        { class: "tiles" },
        TILES.map((t, n) =>
          a(
            "/categoria/" + t.slug,
            { class: "tile reveal", style: `--d:${n * 110}ms` },
            h("img", {
              src: `/assets/${t.img}.webp`,
              alt: t.alt,
              width: t.w,
              height: 900,
              loading: "lazy",
            }),
            h("span", { class: "sheen", "aria-hidden": "true" }),
          ),
        ),
      ),
    ),
    h("div", { id: "strips" }),
    h(
      "section",
      { class: "section how" },
      h(
        "div",
        { class: "wrap" },
        secHead("Passo a passo", "Como comprar"),
        h(
          "ol",
          { class: "steps" },
          STEPS.map(([i, t, d], n) =>
            h(
              "li",
              { class: "step reveal", style: `--d:${n * 100}ms` },
              h(
                "span",
                { class: "step-n" },
                icon(i, { size: 22 }),
                h("b", {}, n + 1),
              ),
              h("div", {}, h("strong", {}, t), h("p", {}, d)),
            ),
          ),
        ),
      ),
    ),
    h(
      "section",
      { class: "section wrap faq" },
      secHead("Dúvidas frequentes", "Perguntas e respostas"),
      h(
        "div",
        { class: "faq-list" },
        FAQ.map(([q, r], n) =>
          h(
            "details",
            { class: "reveal", style: `--d:${n * 60}ms` },
            h(
              "summary",
              {},
              h("span", {}, q),
              icon("plus", { size: 20, cls: "plus" }),
            ),
            h("p", {}, r),
          ),
        ),
      ),
    ),
    h(
      "section",
      { class: "wrap cta-band reveal" },
      h("img", {
        src: "/assets/mascote-sentado.webp",
        alt: "",
        width: 853,
        height: 900,
        loading: "lazy",
      }),
      h(
        "div",
        {},
        h("h2", {}, "Pronto para o próximo jogo?"),
        h("p", {}, "Veja o catálogo completo e finalize em poucos cliques."),
        h(
          "div",
          { class: "cta-row" },
          a(
            "/produtos",
            { class: "btn btn-primary btn-lg" },
            "Explorar catálogo",
            icon("arrow", { size: 20 }),
          ),
          wa &&
            h(
              "a",
              {
                class: "btn btn-lg",
                href: wa,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              icon("whatsapp", { size: 20 }),
              "Tirar dúvidas",
            ),
        ),
      ),
    ),
  );
  mount(root);
  tilt(frame);
  parallax(stage);
  initCategoryCarousel($('.tiles'));
  const [f, n] = await Promise.all([
    strip(
      "Em destaque",
      "Selecionados",
      "featured=1",
      "/produtos?sort=relevance",
    ),
    strip("Novidades", "Chegou agora", "new=1", "/produtos?sort=newest"),
  ]);
  const sx = $("#strips");
  if (sx) {
    sx.append(...[f, n].filter(Boolean));
    observeReveal(sx);
  }
}

const CAT_ART = {
  "jogos-pc-steam": {
    img: "cat-steam",
    w: 1000,
    h: 694,
    tone: "steam",
    alt: "Mascote apontando para um painel: Jogos Steam Offline a partir de R$ 7,90 por jogo.",
  },
  "packs-assinaturas": {
    img: "cat-packs",
    w: 1000,
    h: 751,
    tone: "packs",
    alt: "Mascote mostrando um tablet com streaming, ChatGPT, Claude, cursos e cortes de vídeos.",
  },
  "jogos-videogames": {
    img: "cat-xbox",
    w: 1000,
    h: 910,
    tone: "xbox",
    alt: "Mascote segurando um letreiro: 1 jogo de Xbox por R$ 30 ou 2 por R$ 45.",
  },
};
const CAT_SHORT = {
  "jogos-videogames": "Xbox",
  "jogos-pc-steam": "PC / Steam",
  "packs-assinaturas": "Packs e assinaturas",
};
const SORTS = [
  ["", "Relevância"],
  ["newest", "Novidades"],
  ["price_asc", "Menor preço"],
  ["price_desc", "Maior preço"],
];
const radio = (name, v, t, on) =>
  h(
    "label",
    { class: "chip-r" },
    h("input", { type: "radio", name, value: v, checked: on }),
    h("span", {}, t),
  );
function pager(total, page, size, link) {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= pages; i++)
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  return h(
    "nav",
    { class: "pager", "aria-label": "Paginação" },
    page > 1 &&
      a(
        link(page - 1),
        { class: "pg", "aria-label": "Página anterior" },
        icon("back", { size: 18 }),
      ),
    nums.map((n) =>
      n === "…"
        ? h("span", { class: "pg gap" }, "…")
        : a(
            link(n),
            {
              class: "pg" + (n === page ? " on" : ""),
              "aria-current": n === page ? "page" : null,
              "aria-label": "Página " + n,
            },
            String(n),
          ),
    ),
    page < pages &&
      a(
        link(page + 1),
        { class: "pg", "aria-label": "Próxima página" },
        icon("arrow", { size: 18 }),
      ),
  );
}
export async function catalog(categorySlug) {
  const qs = new URLSearchParams(location.search);
  const page = Math.max(1, Number(qs.get("page")) || 1);
  const base = location.pathname;
  const [cats, plats] = await Promise.all([
    api("/api/categories", { auth: false }).catch(() => []),
    api("/api/platforms", { auth: false }).catch(() => []),
  ]);
  const cat = cats.find((c) => c.slug === categorySlug),
    art = CAT_ART[categorySlug];
  setPage(cat ? cat.name : "Produtos", {
    desc:
      cat?.description ||
      "Catálogo de jogos, assinaturas e serviços digitais da StoreX Games.",
  });
  const push = (fn) => {
    const p = new URLSearchParams(location.search);
    fn(p);
    p.delete("page");
    const q = p.toString();
    go(base + (q ? "?" + q : ""));
  };
  const num = (k) => {
    const n = Number(qs.get(k));
    return qs.get(k) && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const active = [];
  if (qs.get("q")) active.push(["Busca: " + qs.get("q"), (p) => p.delete("q")]);
  if (!categorySlug && qs.get("category"))
    active.push([
      CAT_SHORT[qs.get("category")] || "Categoria",
      (p) => p.delete("category"),
    ]);
  if (qs.get("platform"))
    active.push([qs.get("platform"), (p) => p.delete("platform")]);
  if (num("min") !== null)
    active.push(["A partir de " + money(num("min")), (p) => p.delete("min")]);
  if (num("max") !== null)
    active.push(["Até " + money(num("max")), (p) => p.delete("max")]);
  if (qs.get("available") === "1")
    active.push(["Só disponíveis", (p) => p.delete("available")]);
  const pills = h(
    "nav",
    { class: "cat-pills", "aria-label": "Categorias" },
    [
      ["/produtos", "Todos"],
      ...cats.map((c) => ["/categoria/" + c.slug, CAT_SHORT[c.slug] || c.name]),
    ].map(([href, t]) =>
      a(
        href,
        { class: "pill-link", "aria-current": href === base ? "page" : null },
        t,
      ),
    ),
  );
  const hero = h(
    "header",
    { class: "cat-hero" + (art ? " has-art tone-" + art.tone : "") },
    h(
      "div",
      { class: "ch-copy" },
      h("span", { class: "eyebrow" }, cat ? "Categoria" : "Catálogo"),
      h("h1", {}, cat ? cat.name : "Todos os produtos"),
      h(
        "p",
        { class: "lead" },
        cat?.description || "Encontre jogos, assinaturas e serviços digitais.",
      ),
      pills,
    ),
    art &&
      h(
        "div",
        { class: "ch-art" },
        h("img", {
          src: `/assets/${art.img}.webp`,
          alt: art.alt,
          width: art.w,
          height: art.h,
          fetchpriority: "high",
        }),
      ),
  );
  // painel de filtros (lateral no desktop, gaveta no mobile)
  const qIn = h("input", {
    type: "search",
    name: "q",
    value: qs.get("q") || "",
    maxlength: 60,
    placeholder: "Nome do produto…",
    autocomplete: "off",
  });
  const minIn = h("input", {
    type: "number",
    name: "minr",
    min: 0,
    step: 1,
    inputmode: "numeric",
    placeholder: "Mín.",
    value: num("min") !== null ? Math.round(num("min") / 100) : "",
  });
  const maxIn = h("input", {
    type: "number",
    name: "maxr",
    min: 0,
    step: 1,
    inputmode: "numeric",
    placeholder: "Máx.",
    value: num("max") !== null ? Math.round(num("max") / 100) : "",
  });
  const fieldset = (t, ...k) =>
    h("fieldset", { class: "fset" }, h("legend", {}, t), ...k);
  const form = h(
    "form",
    {
      class: "fpanel-form",
      onsubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const set = (p, k, v) => (v ? p.set(k, v) : p.delete(k));
        const cents = (v) =>
          v !== "" && Number(v) >= 0 ? String(Math.round(Number(v) * 100)) : "";
        push((p) => {
          set(p, "q", String(fd.get("q") || "").trim());
          if (!categorySlug) set(p, "category", fd.get("category"));
          set(p, "platform", fd.get("platform"));
          set(p, "min", cents(fd.get("minr")));
          set(p, "max", cents(fd.get("maxr")));
          set(p, "available", fd.get("available"));
        });
        close();
      },
    },
    fieldset(
      "Buscar",
      h("div", { class: "f-icon" }, icon("search", { size: 18 }), qIn),
    ),
    !categorySlug &&
      cats.length > 0 &&
      fieldset(
        "Categoria",
        h(
          "div",
          { class: "chips-r" },
          [
            ["", "Todas"],
            ...cats.map((c) => [c.slug, CAT_SHORT[c.slug] || c.name]),
          ].map(([v, t]) =>
            radio("category", v, t, (qs.get("category") || "") === v),
          ),
        ),
      ),
    plats.length > 0 &&
      fieldset(
        "Plataforma",
        h(
          "div",
          { class: "chips-r" },
          [["", "Todas"], ...plats.map((p) => [p, p])].map(([v, t]) =>
            radio("platform", v, t, (qs.get("platform") || "") === v),
          ),
        ),
      ),
    fieldset(
      "Preço (R$)",
      h("div", { class: "price-in" }, minIn, h("span", {}, "até"), maxIn),
    ),
    h(
      "label",
      { class: "switch" },
      h("input", {
        type: "checkbox",
        name: "available",
        value: "1",
        checked: qs.get("available") === "1",
      }),
      h("span", { class: "sw-ui", "aria-hidden": "true" }),
      h("span", {}, "Somente disponíveis"),
    ),
    h(
      "div",
      { class: "fp-actions" },
      h(
        "button",
        { class: "btn btn-primary", type: "submit" },
        "Aplicar filtros",
      ),
      active.length > 0 &&
        h(
          "button",
          {
            class: "btn btn-ghost",
            type: "button",
            onclick: () => {
              close();
              go(base);
            },
          },
          "Limpar",
        ),
    ),
  );
  const panel = h(
    "aside",
    { class: "fpanel", id: "fpanel", "aria-label": "Filtros" },
    h(
      "div",
      { class: "fp-head" },
      h("strong", {}, "Filtros"),
      h(
        "button",
        {
          class: "icon-btn",
          type: "button",
          "aria-label": "Fechar filtros",
          onclick: () => close(),
        },
        icon("close", { size: 20 }),
      ),
    ),
    form,
  );
  const backdrop = h("div", { class: "fbackdrop", onclick: () => close() });
  const open = () => {
    panel.classList.add("open");
    backdrop.classList.add("open");
    document.body.classList.add("nav-open");
  };
  function close() {
    panel.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.classList.remove("nav-open");
  }
  const filterBtn = h(
    "button",
    {
      class: "btn btn-sm filter-btn",
      type: "button",
      "aria-controls": "fpanel",
      onclick: open,
    },
    icon("filter", { size: 18 }),
    "Filtros",
    active.length > 0 && h("b", { class: "fcount" }, String(active.length)),
  );
  const sortSel = h(
    "select",
    {
      "aria-label": "Ordenar por",
      onchange: (e) =>
        push((p) =>
          e.target.value ? p.set("sort", e.target.value) : p.delete("sort"),
        ),
    },
    SORTS.map(([v, t]) =>
      h("option", { value: v, selected: (qs.get("sort") || "") === v }, t),
    ),
  );
  const count = h(
    "p",
    { class: "count", "aria-live": "polite" },
    "Carregando…",
  );
  const chips =
    active.length > 0 &&
    h(
      "ul",
      { class: "achips", "aria-label": "Filtros ativos" },
      active.map(([t, fn]) =>
        h(
          "li",
          {},
          h(
            "button",
            {
              class: "achip",
              type: "button",
              "aria-label": "Remover filtro: " + t,
              onclick: () => push(fn),
            },
            t,
            icon("close", { size: 14 }),
          ),
        ),
      ),
      h(
        "li",
        {},
        h(
          "button",
          { class: "link", type: "button", onclick: () => go(base) },
          "Limpar tudo",
        ),
      ),
    );
  const out = h("div", { "aria-live": "polite" }, skeletonGrid(8));
  const onKey = (e) => {
    if (!panel.isConnected)
      return document.removeEventListener("keydown", onKey);
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  mount(
    h(
      "div",
      { class: "wrap page cat-page" },
      hero,
      h(
        "div",
        { class: "cat-layout" },
        panel,
        h(
          "section",
          { class: "cat-main", "aria-label": "Produtos" },
          h(
            "div",
            { class: "toolbar" },
            filterBtn,
            count,
            h("label", { class: "sort" }, h("span", {}, "Ordenar"), sortSel),
          ),
          chips,
          out,
        ),
      ),
      backdrop,
    ),
  );
  const q = new URLSearchParams(qs);
  if (categorySlug) q.set("category", categorySlug);
  q.set("pageSize", "12");
  q.set("page", String(page));
  try {
    const r = await api("/api/products?" + q, { auth: false });
    count.textContent = r.total === 1 ? "1 produto" : `${r.total} produtos`;
    if (!r.items.length) {
      out.replaceChildren(
        emptyArt(
          "Nada por aqui ainda",
          active.length
            ? "Nenhum produto encontrado com esses filtros."
            : "Ainda não há produtos nesta categoria.",
          active.length > 0 &&
            h(
              "button",
              {
                class: "btn btn-primary",
                type: "button",
                onclick: () => go(base),
              },
              "Limpar filtros",
            ),
        ),
      );
      return;
    }
    const link = (n) => {
      const p = new URLSearchParams(location.search);
      p.set("page", n);
      return base + "?" + p;
    };
    out.replaceChildren(
      ...[
        h("div", { class: "grid" }, r.items.map(productCard)),
        pager(r.total, page, r.pageSize, link),
      ].filter(Boolean),
    );
    observeReveal(out);
  } catch (e) {
    count.textContent = "";
    out.replaceChildren(errorBox(e.message, () => catalog(categorySlug)));
  }
}

export async function product(slug) {
  mount(loading());
  try {
    const [p, st] = await Promise.all([
      api("/api/products/" + encodeURIComponent(slug), { auth: false }),
      settings(),
    ]);
    const cfg = comboCfg(st);
    setPage(p.name, {
      desc: (p.long_description || "").replace(/\s+/g, " ").slice(0, 160) || undefined,
    });
    const imgs = p.images?.length ? p.images : [];
    const main = imgOrPlaceholder(
      imgs[0] || p.image_url,
      p.name,
      "gallery-main",
    );
    main.id = "gmain";
    const maxQ = Math.min(p.max_per_order, p.track_stock ? p.stock : 10);
    const qty = h("input", {
      type: "number",
      min: 1,
      max: maxQ,
      value: 1,
      "aria-label": "Quantidade",
    });
    const info = [
      ["Plataforma", p.platform],
      ["Versões", (p.xbox_versions || []).join(" · ")],
      ["Região", p.region],
      ["Edição", p.edition],
      ["Requisitos", p.requirements],
    ].filter(([, v]) => v);
    mount(
      h(
        "article",
        { class: "wrap page pdp" },
        h(
          "div",
          { class: "gallery" },
          main,
          imgs.length > 1 &&
            h(
              "div",
              { class: "thumbs" },
              imgs.map((u) =>
                h(
                  "button",
                  {
                    class: "thumb-btn",
                    type: "button",
                    "aria-label": "Ver imagem",
                    onclick: () => {
                      $("#gmain").src = u;
                    },
                  },
                  h("img", { src: u, alt: "", loading: "lazy" }),
                ),
              ),
            ),
        ),
        h(
          "div",
          { class: "pdp-info" },
          h("h1", {}, p.name),
          p.category_name &&
            a(
              "/categoria/" + p.category_slug,
              { class: "tag" },
              p.category_name,
            ),
          priceBlock(p),
          cfg &&
            p.effective_price_cents === cfg.unit &&
            h(
              "p",
              { class: "tag" },
              `Leve ${cfg.qty} por ${money(cfg.price)} (pode misturar)`,
            ),
          p.in_stock
            ? h(
                "div",
                { class: "buy" },
                maxQ > 1 && h("label", {}, "Qtd ", qty),
                h(
                  "button",
                  {
                    class: "btn btn-primary",
                    onclick: () => {
                      addToCart(
                        p.id,
                        Math.max(1, Math.min(maxQ, Number(qty.value) || 1)),
                        maxQ,
                      );
                      toast("Adicionado ao carrinho.");
                    },
                  },
                  "Adicionar ao carrinho",
                ),
                a("/carrinho", { class: "btn" }, "Ver carrinho"),
              )
            : h(
                "p",
                { class: "state err" },
                "Produto indisponível no momento.",
              ),
          h(
            "p",
            { class: "note" },
            "Entrega automática após a confirmação do pagamento.",
          ),
          info.length > 0 &&
            h(
              "dl",
              { class: "specs" },
              info.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]),
            ),
          p.long_description &&
            h(
              "section",
              {},
              h("h2", {}, "Descrição"),
              p.long_description
                .split("\n")
                .filter(Boolean)
                .map((t) => h("p", {}, t)),
            ),
          p.specific_terms &&
            h(
              "section",
              {},
              h("h2", {}, "Condições deste produto"),
              h("p", {}, p.specific_terms),
            ),
        ),
      ),
    );
  } catch (e) {
    setPage("Produto não encontrado", { noindex: true });
    mount(
      e.status === 404
        ? h(
            "div",
            { class: "state" },
            h("h1", {}, "Produto não encontrado"),
            h("p", {}, "Ele pode ter sido removido ou estar indisponível."),
            a("/produtos", { class: "btn btn-primary" }, "Ver produtos"),
          )
        : errorBox(e.message, () => product(slug)),
    );
  }
}

export async function cart() {
  setPage("Carrinho", { noindex: true });
  const items = getCart();
  if (!items.length)
    return mount(
      h(
        "div",
        { class: "wrap page" },
        emptyArt(
          "Seu carrinho está vazio",
          "Adicione um jogo ou assinatura para começar.",
          a(
            "/produtos",
            { class: "btn btn-primary" },
            "Ver catálogo",
            icon("arrow", { size: 18 }),
          ),
        ),
      ),
    );
  mount(loading());
  try {
    const [r, st] = await Promise.all([
      api(
        "/api/products?pageSize=48&ids=" + items.map((i) => i.id).join(","),
        { auth: false },
      ),
      settings(),
    ]);
    const cfg = comboCfg(st);
    const byId = new Map(r.items.map((p) => [p.id, p]));
    let changed = false;
    for (const i of items)
      if (!byId.has(i.id)) {
        removeItem(i.id);
        changed = true;
      }
    if (changed) toast("Itens indisponíveis foram removidos.", "err");
    const lines = getCart()
      .map((i) => ({ ...i, p: byId.get(i.id) }))
      .filter((l) => l.p);
    if (!lines.length) return cart();
    const subtotal = lines.reduce(
      (s, l) => s + l.p.effective_price_cents * l.qty,
      0,
    );
    const disc = comboDiscount(
      lines.map((l) => ({ unit: l.p.effective_price_cents, qty: l.qty })),
      cfg,
    );
    const total = subtotal - disc;
    let cp = 0;
    const totalEl = h("strong", {}, money(total));
    const cpMsg = h("p", { class: "note", "aria-live": "polite" });
    const cpIn = h("input", {
      type: "text",
      placeholder: "Cupom",
      maxlength: 20,
      "aria-label": "Cupom de desconto",
    });
    const cpBtn = h(
      "button",
      {
        class: "btn btn-sm",
        type: "button",
        onclick: async () => {
          if (!isLoggedIn()) return go("/entrar?next=/carrinho");
          try {
            const r2 = await api("/api/coupon/check", {
              method: "POST",
              body: { code: cpIn.value },
            });
            cp = r2.percent;
            const c = Math.floor((total * cp) / 100);
            totalEl.textContent = money(total - c);
            cpMsg.textContent = `Cupom aplicado: -${money(c)}`;
          } catch (e) {
            cp = 0;
            totalEl.textContent = money(total);
            cpMsg.textContent = e.message;
          }
        },
      },
      "Aplicar",
    );
    const btn = h(
      "button",
      { class: "btn btn-primary btn-lg", type: "button" },
      isLoggedIn() ? "Finalizar compra" : "Entrar para finalizar",
    );
    btn.addEventListener("click", async () => {
      if (!isLoggedIn()) return go("/entrar?next=/carrinho");
      btn.disabled = true;
      btn.textContent = "Processando…";
      try {
        const o = await api("/api/orders", {
          method: "POST",
          body: {
            idempotencyKey: idempotencyKey(),
            items: getCart().map((i) => ({ productId: i.id, quantity: i.qty })),
            coupon: cp ? cpIn.value : undefined,
          },
        });
        clearCart();
        sessionStorage.removeItem("sx_idem");
        if (
          o.checkoutUrl &&
          /^https:\/\/([a-z0-9-]+\.)*infinitepay\.(io|com\.br)\//i.test(
            o.checkoutUrl,
          )
        )
          location.href = o.checkoutUrl;
        else go("/pedido/" + o.ref);
      } catch (e) {
        toast(
          e.status === 403 && e.code === "email_not_confirmed"
            ? "Confirme seu e-mail para finalizar a compra."
            : e.message,
          "err",
        );
        btn.disabled = false;
        btn.textContent = "Finalizar compra";
      }
    });
    mount(
      h(
        "div",
        { class: "wrap page" },
        h("h1", {}, "Carrinho"),
        h(
          "ul",
          { class: "cart" },
          lines.map((l) => {
            const max = Math.min(
              l.p.max_per_order,
              l.p.track_stock ? l.p.stock : 10,
            );
            return h(
              "li",
              { class: "cart-line" },
              imgOrPlaceholder(l.p.image_url, "", "thumb sm"),
              h(
                "div",
                {},
                a("/produto/" + l.p.slug, {}, l.p.name),
                priceBlock(l.p),
              ),
              max > 1
                ? h(
                    "label",
                    {},
                    "Qtd ",
                    h("input", {
                      type: "number",
                      min: 1,
                      max,
                      value: l.qty,
                      onchange: (e) => {
                        setQty(
                          l.id,
                          Math.max(
                            1,
                            Math.min(max, Number(e.target.value) || 1),
                          ),
                        );
                        cart();
                      },
                    }),
                  )
                : h("span", {}, "Qtd 1"),
              h("strong", {}, money(l.p.effective_price_cents * l.qty)),
              h(
                "button",
                {
                  class: "btn btn-ghost",
                  type: "button",
                  onclick: () => {
                    removeItem(l.id);
                    cart();
                  },
                },
                "Remover",
              ),
            );
          }),
        ),
        h(
          "div",
          { class: "summary" },
          disc > 0 &&
            h(
              "p",
              { class: "note" },
              `Combo ${cfg.qty} por ${money(cfg.price)} aplicado: -${money(disc)}`,
            ),
          h("div", { class: "row" }, cpIn, cpBtn),
          cpMsg,
          h("p", {}, "Total: ", totalEl),
          h(
            "p",
            { class: "note" },
            "Valores conferidos novamente no servidor ao finalizar. Pagamento no checkout seguro da InfinitePay; entrega automática após a confirmação.",
          ),
          btn,
        ),
      ),
    );
  } catch (e) {
    mount(errorBox(e.message, cart));
  }
}

export async function policy(slug) {
  mount(loading());
  try {
    const p = await api("/api/pages/" + encodeURIComponent(slug), {
      auth: false,
    });
    setPage(p.title);
    mount(
      h(
        "article",
        { class: "wrap page prose" },
        h("h1", {}, p.title),
        p.body.split("\n").map((t) => (t.trim() ? h("p", {}, t) : null)),
        h(
          "p",
          { class: "note" },
          "Texto-modelo editável pelo proprietário. Não substitui orientação jurídica.",
        ),
      ),
    );
  } catch (e) {
    mount(errorBox(e.status === 404 ? "Página não encontrada." : e.message));
  }
}
export const notFound = () => {
  setPage("Página não encontrada", { noindex: true });
  mount(
    h(
      "div",
      { class: "wrap page" },
      emptyArt(
        "Página não encontrada",
        "O endereço pode ter mudado ou não existe.",
        a("/", { class: "btn btn-primary" }, "Voltar ao início"),
      ),
    ),
  );
};
export { settings, badge };