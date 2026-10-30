import {
  h,
  a,
  icon,
  money,
  fmtDate,
  mount,
  setPage,
  loading,
  errorBox,
  empty,
  toast,
  go,
  field,
  safeNext,
  badge,
  STATUS,
} from "./ui.js";
import { api, settings } from "./api.js";
import {
  login,
  signup,
  recover,
  setNewPassword,
  logout,
  isLoggedIn,
} from "./auth.js";

let _id = 0;
const fieldIcon = (label, ic, input, extra, hint) => {
  const id = "af" + ++_id;
  input.id = id;
  return h(
    "div",
    { class: "field" },
    h("label", { for: id }, label),
    h("div", { class: "f-icon" }, icon(ic, { size: 18 }), input, extra),
    hint && h("small", {}, hint),
  );
};
function pwField(label, { autocomplete, minlength, name = "password" } = {}) {
  const input = h("input", {
    type: "password",
    name,
    required: true,
    autocomplete,
    minlength,
    placeholder: "Sua senha",
  });
  const t = h(
    "button",
    {
      type: "button",
      class: "pw-toggle",
      "aria-label": "Mostrar senha",
      onclick: () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        t.replaceChildren(icon(show ? "eyeoff" : "eye", { size: 18 }));
        t.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
        input.focus();
      },
    },
    icon("eye", { size: 18 }),
  );
  return {
    input,
    node: fieldIcon(
      label,
      "lock",
      input,
      t,
      minlength ? `Mínimo de ${minlength} caracteres.` : null,
    ),
  };
}
function strength(input) {
  // guia visual (a regra real é validada pelo Supabase)
  const bar = h("i"),
    txt = h("span", {}, "");
  const w = h(
    "div",
    { class: "meter", "aria-live": "polite" },
    h("div", { class: "meter-bar" }, bar),
    txt,
  );
  input.addEventListener("input", () => {
    const v = input.value;
    const sc = v
      ? (v.length >= 8) +
        (v.length >= 12) +
        (/[a-z]/.test(v) && /[A-Z]/.test(v)) +
        /\d/.test(v) +
        /[^A-Za-z0-9]/.test(v)
      : 0;
    bar.style.width = (sc / 5) * 100 + "%";
    w.dataset.s = sc >= 4 ? "ok" : sc >= 3 ? "mid" : v ? "low" : "";
    txt.textContent = !v
      ? ""
      : sc >= 4
        ? "Senha forte"
        : sc >= 3
          ? "Senha média"
          : "Senha fraca";
  });
  return w;
}
const submitBtn = (t) =>
  h(
    "button",
    { class: "btn btn-primary btn-lg btn-block", type: "submit" },
    h("span", { class: "spin", "aria-hidden": "true" }),
    h("span", { class: "bt" }, t),
  );
export function authPage() {
  setPage("Entrar", { noindex: true });
  const qs = new URLSearchParams(location.search);
  const next = safeNext(qs.get("next"));
  if (isLoggedIn()) return go(next, true);
  const msg = h("div", {
    class: "auth-msg",
    role: "status",
    "aria-live": "polite",
  });
  const body = h("div", { class: "auth-body" });
  const title = h("h2", {});
  const sub = h("p", { class: "muted" });
  const say = (t, kind = "ok") => {
    msg.className = "auth-msg show " + kind;
    msg.setAttribute("role", kind === "err" ? "alert" : "status");
    msg.replaceChildren(
      icon(kind === "err" ? "info" : "check", { size: 18 }),
      h("span", {}, t),
    );
  };
  const clear = () => {
    msg.className = "auth-msg";
    msg.replaceChildren();
  };
  const lock = async (btn, fn) => {
    clear();
    btn.disabled = true;
    btn.classList.add("loading");
    try {
      await fn();
    } catch (e) {
      say(e.message, "err");
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  };
  const seg = h(
    "div",
    { class: "seg", role: "tablist", "data-i": "0" },
    h("span", { class: "seg-ind", "aria-hidden": "true" }),
  );
  const views = {
    login() {
      const em = h("input", {
        type: "email",
        name: "email",
        required: true,
        autocomplete: "email",
        placeholder: "voce@email.com",
      });
      const p = pwField("Senha", { autocomplete: "current-password" });
      const b = submitBtn("Entrar");
      return h(
        "form",
        {
          class: "auth-form",
          onsubmit: (e) => {
            e.preventDefault();
            lock(b, async () => {
              await login(em.value.trim(), p.input.value);
              go(next, true);
            });
          },
        },
        fieldIcon("E-mail", "mail", em),
        p.node,
        h(
          "div",
          { class: "auth-row" },
          h(
            "button",
            { class: "link", type: "button", onclick: () => show("recover") },
            "Esqueci minha senha",
          ),
        ),
        b,
      );
    },
    signup() {
      const n = h("input", {
        type: "text",
        name: "name",
        maxlength: 80,
        autocomplete: "name",
        required: true,
        placeholder: "Seu nome",
      });
      const em = h("input", {
        type: "email",
        name: "email",
        required: true,
        autocomplete: "email",
        placeholder: "voce@email.com",
      });
      const p = pwField("Senha", {
        autocomplete: "new-password",
        minlength: 8,
      });
      const b = submitBtn("Criar conta");
      return h(
        "form",
        {
          class: "auth-form",
          onsubmit: (e) => {
            e.preventDefault();
            lock(b, async () => {
              await signup(em.value.trim(), p.input.value, n.value.trim());
              await login(em.value.trim(), p.input.value);
              go(next, true);
            });
          },
        },
        fieldIcon("Nome", "user", n),
        fieldIcon("E-mail", "mail", em),
        p.node,
        strength(p.input),
        b,
        h(
          "p",
          { class: "auth-note" },
          "Ao criar a conta você concorda com os ",
          a("/politicas/termos", {}, "Termos de compra"),
          " e a ",
          a("/politicas/privacidade", {}, "Política de privacidade"),
          ".",
        ),
      );
    },
    recover() {
      const em = h("input", {
        type: "email",
        name: "email",
        required: true,
        autocomplete: "email",
        placeholder: "voce@email.com",
      });
      const b = submitBtn("Enviar link");
      return h(
        "form",
        {
          class: "auth-form",
          onsubmit: (e) => {
            e.preventDefault();
            lock(b, async () => {
              await recover(em.value.trim());
              say(
                "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
              );
            });
          },
        },
        fieldIcon("E-mail da conta", "mail", em),
        b,
        h(
          "div",
          { class: "auth-row" },
          h(
            "button",
            { class: "link", type: "button", onclick: () => show("login") },
            "Voltar para o login",
          ),
        ),
      );
    },
  };
  const T = {
    login: [
      "Bem-vindo de volta",
      "Entre para finalizar compras e acompanhar seus pedidos.",
    ],
    signup: ["Crie sua conta", "Cadastre-se rapidamente e comece a comprar."],
    recover: [
      "Recuperar senha",
      "Informe o e-mail da conta para receber o link de redefinição.",
    ],
  };
  function show(v) {
    clear();
    title.textContent = T[v][0];
    sub.textContent = T[v][1];
    body.replaceChildren(views[v]());
    seg.hidden = v === "recover";
    seg.dataset.i = v === "signup" ? "1" : "0";
    seg.querySelectorAll("button").forEach((x) => x.remove());
    seg.append(
      ...[
        ["login", "Entrar"],
        ["signup", "Criar conta"],
      ].map(([k, t]) =>
        h(
          "button",
          {
            class: "seg-b",
            role: "tab",
            type: "button",
            "aria-selected": String(k === v),
            onclick: () => show(k),
          },
          t,
        ),
      ),
    );
    body.firstChild.querySelector("input")?.focus({ preventScroll: true });
  }
  mount(
    h(
      "div",
      { class: "wrap page auth-shell" },
      h(
        "section",
        { class: "auth-aside" },
        h("img", {
          class: "auth-logo",
          src: "/assets/logo.webp",
          alt: "StoreX Games",
          width: 512,
          height: 512,
        }),
        h("h1", {}, "Sua conta StoreX"),
        h(
          "p",
          { class: "lead" },
          "Compre com segurança e acompanhe cada pedido em um só lugar.",
        ),
        h(
          "ul",
          { class: "auth-perks" },
          [
            ["receipt", "Acompanhe pedidos e status do pagamento"],
            ["lock", "Instruções liberadas só após o pagamento confirmado"],
            ["whatsapp", "Suporte direto no WhatsApp"],
          ].map(([i, t]) =>
            h("li", {}, h("span", {}, icon(i, { size: 18 })), t),
          ),
        ),
      ),
      h(
        "section",
        { class: "auth-card", "aria-labelledby": "auth-t" },
        seg,
        title,
        sub,
        msg,
        body,
      ),
    ),
  );
  title.id = "auth-t";
  show(qs.get("cadastro") ? "signup" : "login");
}
export function resetPage() {
  setPage("Redefinir senha", { noindex: true });
  const p = pwField("Nova senha", {
    autocomplete: "new-password",
    minlength: 8,
  });
  const msg = h("div", {
    class: "auth-msg",
    role: "status",
    "aria-live": "polite",
  });
  const b = submitBtn("Salvar nova senha");
  mount(
    h(
      "div",
      { class: "wrap page auth-shell single" },
      h(
        "form",
        {
          class: "auth-card auth-form",
          onsubmit: async (e) => {
            e.preventDefault();
            b.disabled = true;
            b.classList.add("loading");
            try {
              await setNewPassword(p.input.value);
              toast("Senha alterada. Faça login.");
              await logout();
              go("/entrar", true);
            } catch (er) {
              msg.className = "auth-msg show err";
              msg.replaceChildren(
                icon("info", { size: 18 }),
                h("span", {}, er.message),
              );
              b.disabled = false;
              b.classList.remove("loading");
            }
          },
        },
        h("h2", {}, "Nova senha"),
        h("p", { class: "muted" }, "Escolha uma senha nova para a sua conta."),
        msg,
        p.node,
        strength(p.input),
        b,
      ),
    ),
  );
}
export async function account() {
  setPage("Minha conta", { noindex: true });
  if (!isLoggedIn()) return go("/entrar?next=/conta", true);
  mount(loading());
  try {
    const [me, orders] = await Promise.all([
      api("/api/me"),
      api("/api/orders"),
    ]);
    const name = h("input", {
        type: "text",
        maxlength: 80,
        value: me.displayName || "",
      }),
      phone = h("input", {
        type: "tel",
        maxlength: 20,
        value: me.phone || "",
        autocomplete: "tel",
      });
    mount(
      h(
        "div",
        { class: "wrap page" },
        h("h1", {}, "Minha conta"),
        h(
          "p",
          { class: "muted" },
          me.email,
          !me.confirmed && " (e-mail não confirmado)",
        ),
        me.isAdmin && a("/admin", { class: "btn" }, "Painel administrativo"),
        h(
          "form",
          {
            class: "card form",
            onsubmit: async (e) => {
              e.preventDefault();
              try {
                await api("/api/me", {
                  method: "PATCH",
                  body: { displayName: name.value, phone: phone.value },
                });
                toast("Dados salvos.");
              } catch (er) {
                toast(er.message, "err");
              }
            },
          },
          h("h2", {}, "Meus dados"),
          field("Nome", name),
          field("Telefone (opcional)", phone),
          h("button", { class: "btn btn-primary", type: "submit" }, "Salvar"),
        ),
        h("h2", {}, "Meus pedidos"),
        orders.length
          ? h(
              "div",
              { class: "table-wrap" },
              h(
                "table",
                {},
                h(
                  "thead",
                  {},
                  h(
                    "tr",
                    {},
                    ["Pedido", "Data", "Total", "Status", ""].map((t) =>
                      h("th", { scope: "col" }, t),
                    ),
                  ),
                ),
                h(
                  "tbody",
                  {},
                  orders.map((o) =>
                    h(
                      "tr",
                      {},
                      h("td", {}, o.ref),
                      h("td", {}, fmtDate(o.createdAt)),
                      h("td", {}, money(o.totalCents)),
                      h(
                        "td",
                        {},
                        badge(
                          o.paymentStatus === "paid"
                            ? o.status
                            : o.paymentStatus === "pending"
                              ? "pending"
                              : o.status,
                        ),
                      ),
                      h(
                        "td",
                        {},
                        a("/pedido/" + o.ref, { class: "btn" }, "Abrir"),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : empty("Você ainda não fez pedidos."),
        h(
          "p",
          {},
          h(
            "button",
            {
              class: "btn btn-ghost",
              onclick: async () => {
                await logout();
                go("/", true);
              },
            },
            "Sair",
          ),
        ),
      ),
    );
  } catch (e) {
    if (e.status === 401) {
      await logout();
      return go("/entrar?next=/conta", true);
    }
    mount(errorBox(e.message, account));
  }
}
export async function orderPage(ref) {
  setPage("Pedido " + ref, { noindex: true });
  if (!isLoggedIn())
    return go("/entrar?next=/pedido/" + encodeURIComponent(ref), true);
  mount(loading());
  try {
    const qs = new URLSearchParams(location.search);
    let o = await api("/api/orders/" + encodeURIComponent(ref));
    // Retorno do checkout ≠ prova de pagamento: pedimos ao servidor que confira na InfinitePay.
    if (
      o.paymentStatus === "pending" &&
      (qs.get("transaction_nsu") || qs.get("slug"))
    ) {
      history.replaceState({}, "", location.pathname);
      try {
        await api(`/api/orders/${ref}/verify`, {
          method: "POST",
          body: {
            transaction_nsu: qs.get("transaction_nsu"),
            slug: qs.get("slug"),
          },
        });
        o = await api("/api/orders/" + encodeURIComponent(ref));
      } catch (e) {
        toast(e.message, "err");
      }
    }
    const head = [
      h("h1", {}, "Pedido " + o.ref),
      h(
        "p",
        {},
        badge(o.paymentStatus === "paid" ? o.status : o.paymentStatus),
        " • ",
        fmtDate(o.createdAt),
        " • ",
        h("strong", {}, money(o.totalCents)),
      ),
    ];
    const list = h(
      "ul",
      { class: "order-items" },
      o.items.map((i) =>
        h("li", {}, `${i.quantity}× ${i.name} — ${money(i.subtotalCents)}`),
      ),
    );
    const parts = [...head, list];
    if (o.discountCents > 0)
      parts.push(
        h("p", { class: "note" }, "Desconto do combo: -" + money(o.discountCents)),
      );
    if (o.paymentStatus === "paid") {
      parts.push(
        h(
          "div",
          { class: "state ok", role: "status" },
          h("h2", {}, "Pagamento confirmado"),
          h(
            "p",
            {},
            "Próximo passo: fale com o vendedor no WhatsApp para receber seu produto.",
          ),
        ),
      );
      if (o.whatsappUrl)
        parts.push(
          h(
            "a",
            {
              class: "btn btn-primary btn-lg",
              href: o.whatsappUrl,
              target: "_blank",
              rel: "noopener noreferrer",
              onclick: () =>
                api(`/api/orders/${o.ref}/whatsapp-click`, {
                  method: "POST",
                }).catch(() => {}),
            },
            "Falar com o vendedor no WhatsApp",
          ),
          h(
            "p",
            { class: "note" },
            "O botão apenas abre a conversa; é preciso tocar em enviar. Nenhuma mensagem é enviada automaticamente.",
          ),
        );
      else
        parts.push(
          h(
            "p",
            { class: "note" },
            "O WhatsApp do vendedor ainda não foi configurado. Use a página de contato.",
          ),
        );
      // Pós-compra: somente o campo de instruções.
      for (const i of o.items) {
        const t = i.instructions?.instructions;
        if (t)
          parts.push(
            h(
              "section",
              { class: "card" },
              h("h3", {}, "Instruções: " + i.name),
              ...t
                .split("\n")
                .filter(Boolean)
                .map((x) => h("p", {}, x)),
            ),
          );
      }
      if (o.receiptUrl)
        parts.push(
          h(
            "p",
            {},
            h(
              "a",
              {
                href: o.receiptUrl,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              "Ver comprovante",
            ),
          ),
        );
    } else if (o.paymentStatus === "pending") {
      parts.push(
        h(
          "div",
          { class: "state", role: "status" },
          h(
            "p",
            {},
            "Este pedido ainda NÃO foi pago. Instruções e WhatsApp serão liberados após a confirmação do pagamento.",
          ),
        ),
      );
      const pay = o.checkoutUrl
        ? h(
            "a",
            { class: "btn btn-primary", href: o.checkoutUrl },
            "Ir para o pagamento",
          )
        : h(
            "button",
            {
              class: "btn btn-primary",
              onclick: async (e) => {
                e.target.disabled = true;
                try {
                  const r = await api(`/api/orders/${o.ref}/checkout`, {
                    method: "POST",
                  });
                  if (r.checkoutUrl) location.href = r.checkoutUrl;
                  else toast("Modo de teste: checkout real não configurado.");
                } catch (er) {
                  toast(er.message, "err");
                }
                e.target.disabled = false;
              },
            },
            "Gerar link de pagamento",
          );
      parts.push(
        h(
          "div",
          { class: "row" },
          pay,
          h(
            "button",
            { class: "btn", onclick: () => orderPage(ref) },
            "Já paguei — verificar",
          ),
          h(
            "button",
            {
              class: "btn btn-ghost",
              onclick: async () => {
                if (confirm("Cancelar este pedido?")) {
                  try {
                    await api(`/api/orders/${o.ref}/cancel`, {
                      method: "POST",
                    });
                    orderPage(ref);
                  } catch (er) {
                    toast(er.message, "err");
                  }
                }
              },
            },
            "Cancelar pedido",
          ),
        ),
      );
    } else
      parts.push(
        h(
          "div",
          { class: "state" },
          h(
            "p",
            {},
            "Situação: " +
              (STATUS[o.paymentStatus] || o.paymentStatus) +
              ". Em caso de dúvida, fale com o suporte.",
          ),
        ),
      );
    parts.push(a("/conta", { class: "btn btn-ghost" }, "← Meus pedidos"));
    mount(h("div", { class: "wrap page order" }, parts));
  } catch (e) {
    mount(
      e.status === 404
        ? h(
            "div",
            { class: "state" },
            h("h1", {}, "Pedido não encontrado"),
            a("/conta", { class: "btn" }, "Meus pedidos"),
          )
        : errorBox(e.message, () => orderPage(ref)),
    );
  }
}
export { settings };