/* ============================================================
   OHM — app.js
   Shell da aplicação: roteador hash, sidebar (web) + barra
   inferior (app), RBAC nas rotas, modais, toasts e fluxos de
   comando com as regras de segurança da seção 7 do planejamento.
   ============================================================ */
(function () {
  "use strict";

  const app = document.getElementById("app");
  let currentUser = null;
  let currentRoute = null;

  /* ---------- armazenamento seguro (localStorage pode estar bloqueado) ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  /* ---------- tema ---------- */
  function initTheme() {
    const saved = store.get("ohm-theme");
    if (saved) document.documentElement.dataset.theme = saved;
    else if (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";
  }
  function toggleTheme() {
    const cur = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = cur;
    store.set("ohm-theme", cur);
  }

  /* ---------- sessão ---------- */
  function setUser(u) {
    currentUser = u;
    if (u) { store.set("ohm-user", u.id); u.lastAccess = Date.now(); }
    else store.del("ohm-user");
  }
  function restoreUser() {
    const id = store.get("ohm-user");
    if (id) currentUser = OHM.user.byId(id) || null;
    if (currentUser && !currentUser.active) currentUser = null;
  }

  /* ---------- utilitários de UI ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, kind) {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 350); }, 4200);
  }

  function modal(opts) {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<h3>${esc(opts.title)}</h3><div class="modal-body">${opts.body || ""}</div>
      <div class="modal-actions">${(opts.actions || []).map((a, i) => `<button class="btn ${a.kind || ""}" data-ma="${i}">${esc(a.label)}</button>`).join("")}</div>`;
    back.appendChild(m);
    document.body.appendChild(back);
    const close = () => back.remove();
    (opts.actions || []).forEach((a, i) =>
      m.querySelector(`[data-ma="${i}"]`).addEventListener("click", () => a.onClick(close)));
    back.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return { root: m, close };
  }

  function stateBadge(eq) {
    if (!eq.online) return `<span class="badge offline">📡 offline</span>`;
    if (eq._pending) return `<span class="badge standby"><span class="spin"></span> aguardando</span>`;
    if (eq.state === "on") return `<span class="badge on">● ligado</span>`;
    if (eq.state === "standby") return `<span class="badge standby">◐ standby</span>`;
    return `<span class="badge off">○ desligado</span>`;
  }

  function pageHeader(title, sub, actionsHtml) {
    return `<div class="row mb" style="align-items:flex-start">
      <div style="flex:1;min-width:0"><h1>${title}</h1>${sub ? `<div class="muted small" style="margin-top:2px">${sub}</div>` : ""}</div>
      ${actionsHtml ? `<div class="row no-print">${actionsHtml}</div>` : ""}
    </div>`;
  }

  /* ---------- fluxo de comando (seção 7: segurança e retorno) ---------- */
  async function execCommand(eq, desired, opts) {
    eq._pending = true;
    rerender();
    const r = await OHM.sim.sendCommand(eq, desired, { userId: currentUser.id, channel: opts.channel || "web" });
    eq._pending = false;
    if (r.ok) toast(`${eq.name} — comando confirmado pelo sensor: ${desired === "off" ? "desligado" : "ligado"}.`, "good");
    else toast(`${eq.name} — ${r.reason}`, "bad");
    rerender();
  }

  function requestToggle(eq, desired, opts) {
    opts = opts || {};
    if (!eq.online) { toast(`${eq.name} está offline — comando indisponível. Pode ser necessário verificar no local.`, "bad"); rerender(); return; }
    if (!OHM.perm.canControlEq(currentUser, eq)) { toast("Você não tem permissão para controlar este equipamento.", "bad"); return; }

    if (eq.critical && desired === "off") {
      modal({
        title: "⚠️ Desligar equipamento crítico",
        body: `<p class="small"><b>${esc(eq.name)}</b> é um equipamento industrial crítico e pode estar em operação. O desligamento indevido durante um ciclo de produção pode causar perdas e riscos.</p>
          <label class="checkrow mt"><input type="checkbox" id="cc-ok"> Confirmo que o equipamento <b>não está em ciclo de produção</b> (intertravamento verificado)</label>`,
        actions: [
          { label: "Cancelar", onClick: (c) => { c(); rerender(); } },
          { label: "Desligar mesmo assim", kind: "danger", onClick: (c) => {
              if (!document.getElementById("cc-ok").checked) { toast("Marque a confirmação do intertravamento.", "warn"); return; }
              c(); execCommand(eq, "off", opts);
            } },
        ],
      });
      return;
    }
    if (eq.critical && desired === "on") {
      modal({
        title: "🔒 Ligar equipamento crítico remotamente",
        body: `<p class="small">Ligar uma máquina à distância é <b>ainda mais restrito</b> do que desligar: exige certeza de que não há ninguém em zona de risco. Digite <b>LIGAR</b> para confirmar.</p>
          <div class="field mt"><input class="input" id="cc-type" placeholder="LIGAR"></div>`,
        actions: [
          { label: "Cancelar", onClick: (c) => { c(); rerender(); } },
          { label: "Confirmar", kind: "danger", onClick: (c) => {
              if (document.getElementById("cc-type").value.trim().toUpperCase() !== "LIGAR") { toast("Digite LIGAR para confirmar.", "warn"); return; }
              c(); execCommand(eq, "on", opts);
            } },
        ],
      });
      return;
    }
    execCommand(eq, desired, opts);
  }

  /* desligamento em lote: confirmação, execução e resultado por item */
  function bulkShutdownFlow(eqs, title) {
    const criticals = eqs.filter((e) => e.critical);
    const targets = eqs.filter((e) => !e.critical);
    if (!targets.length) { toast("Nenhum equipamento elegível (críticos não entram em ação em lote).", "warn"); return; }

    const m = modal({
      title: title || "Encerrar expediente",
      body: `
        <p class="small muted">O OHM mostra o que será desligado antes de executar:</p>
        <div class="mt" id="bulk-list">
          ${targets.map((e) => `
            <div class="list-item" data-bi="${e.id}">
              <div class="li-ico">${OHM.eqIcons[e.type]}</div>
              <div class="li-body"><div class="li-title">${esc(e.name)}</div><div class="li-sub">${OHM.loc.byId(e.ambienteId).name}${!e.online ? " · ⚠ offline" : ""}</div></div>
              <div class="li-end"><span class="result-chip sending" data-bs="${e.id}">aguardando</span></div>
            </div>`).join("")}
        </div>
        ${criticals.length ? `<div class="notice warn mt">⚠️ <span>${criticals.length} equipamento(s) crítico(s) ficam de fora de ações em lote por segurança (desligue individualmente com confirmação).</span></div>` : ""}`,
      actions: [
        { label: "Cancelar", onClick: (c) => c() },
        { label: `⏻ Desligar ${targets.length} equipamento(s)`, kind: "danger", onClick: async (c) => {
            const btns = m.root.querySelectorAll(".modal-actions button");
            btns.forEach((b) => (b.disabled = true));
            const chip = (id) => m.root.querySelector(`[data-bs="${id}"]`);
            const results = await OHM.sim.bulkShutdown(targets, { userId: currentUser.id, channel: "app" }, (id, st) => {
              const el = chip(id);
              if (!el) return;
              if (st.status === "sending") { el.className = "result-chip sending"; el.innerHTML = `<span class="spin"></span> enviando…`; }
              else if (st.status === "ok") { el.className = "result-chip ok"; el.textContent = "✓ desligado"; }
              else { el.className = "result-chip fail"; el.textContent = "✕ falhou — offline"; }
            });
            const ok = results.filter((r) => r.ok).length, fail = results.length - ok;
            const summary = document.createElement("div");
            summary.className = "notice " + (fail ? "warn" : "info");
            summary.style.marginTop = "12px";
            summary.innerHTML = fail
              ? `⚠️ <span><b>${ok} desligado(s), ${fail} falhou(falharam).</b> O que falhou está offline e pode ter ficado ligado — verifique no local.</span>`
              : `✅ <span><b>Todos os ${ok} equipamentos foram desligados e confirmados.</b> Uma ronda de 20 minutos virou um minuto.</span>`;
            m.root.querySelector(".modal-body").appendChild(summary);
            btns.forEach((b) => b.remove());
            const done = document.createElement("button");
            done.className = "btn primary";
            done.textContent = "Concluir";
            done.addEventListener("click", () => { m.close(); rerender(); });
            m.root.querySelector(".modal-actions").appendChild(done);
          } },
      ],
    });
  }

  /* ---------- navegação ---------- */
  const routes = [
    ["/login", "login", { public: true, bare: true }],
    ["/inicio", "inicio"],
    ["/consumo", "consumo"],
    ["/ambientes", "ambientes"],
    ["/ambientes/:id", "ambienteDetail"],
    ["/equipamentos", "equipamentos"],
    ["/equipamentos/:id", "equipDetail"],
    ["/meus", "meus"],
    ["/automacoes", "automacoes", { admin: true }],
    ["/automacoes/nova", "regraForm", { admin: true }],
    ["/automacoes/:id", "regraForm", { admin: true }],
    ["/alertas", "alertas"],
    ["/alertas/:id", "alertaDetail"],
    ["/saude", "saude", { admin: true }],
    ["/relatorios", "relatorios"],
    ["/projecao", "projecao", { admin: true }],
    ["/admin/usuarios", "usuarios", { admin: true }],
    ["/admin/locais", "locais", { admin: true }],
    ["/admin/dispositivos", "dispositivos", { admin: true }],
    ["/admin/config", "configuracoes", { admin: true }],
    ["/admin/historico", "historico", { admin: true }],
    ["/perfil", "perfil"],
  ];

  function matchRoute(path) {
    for (const [pattern, view, opts] of routes) {
      const pp = pattern.split("/").filter(Boolean);
      const sp = path.split("/").filter(Boolean);
      if (pp.length !== sp.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < pp.length; i++) {
        if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
        else if (pp[i] !== sp[i]) { ok = false; break; }
      }
      if (ok) return { view, params, opts: opts || {} };
    }
    return null;
  }

  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  /* ---------- shell ---------- */
  function alertCount() {
    if (!currentUser) return 0;
    const vis = new Set(OHM.perm.visibleEquipments(currentUser).map((e) => e.id));
    return OHM.alerts.filter((a) => a.state === "novo" && !a.silenced && vis.has(a.eqId)).length;
  }

  function navItem(href, ico, label, path, count) {
    const active = path === href.slice(1) || (href !== "#/inicio" && path.startsWith(href.slice(1)));
    return `<a class="nav-item ${active ? "active" : ""}" href="${href}"><span class="ico">${ico}</span>${label}${count ? `<span class="count">${count}</span>` : ""}</a>`;
  }

  function shellHtml(path) {
    const u = currentUser;
    const n = alertCount();
    const isAdmin = u.role === "admin";
    return `
    <div class="shell">
      <aside class="sidebar no-print">
        <div class="brand">
          <div class="brand-mark">Ω</div>
          <div><div class="brand-name">OHM</div><div class="brand-sub">medir · entender · agir</div></div>
        </div>
        ${navItem("#/inicio", "🏠", "Início", path)}
        <div class="nav-section">Monitoramento</div>
        ${navItem("#/consumo", "📊", "Consumo", path)}
        ${navItem("#/ambientes", "🏢", "Ambientes", path)}
        ${navItem("#/equipamentos", "🔌", "Equipamentos", path)}
        <div class="nav-section">Ação</div>
        ${navItem("#/meus", "⚡", "Meus equipamentos", path)}
        ${isAdmin ? navItem("#/automacoes", "🤖", "Automações", path) : ""}
        <div class="nav-section">Inteligência</div>
        ${navItem("#/alertas", "🔔", "Alertas", path, n)}
        ${isAdmin ? navItem("#/saude", "🩺", "Saúde e manutenção", path) : ""}
        <div class="nav-section">Gestão</div>
        ${navItem("#/relatorios", "📄", "Relatórios", path)}
        ${isAdmin ? navItem("#/projecao", "📈", "Projeção e economia", path) : ""}
        ${isAdmin ? `
        <div class="nav-section">Administração</div>
        ${navItem("#/admin/usuarios", "👥", "Usuários e permissões", path)}
        ${navItem("#/admin/locais", "🗂️", "Estrutura de locais", path)}
        ${navItem("#/admin/dispositivos", "📡", "Dispositivos e sensores", path)}
        ${navItem("#/admin/config", "⚙️", "Configurações", path)}
        ${navItem("#/admin/historico", "🧾", "Histórico de ações", path)}` : ""}
        <div class="nav-section">Conta</div>
        ${navItem("#/perfil", "👤", "Perfil", path)}
      </aside>
      <div class="main">
        <div class="topbar no-print">
          <span class="crumb">${esc(OHM.config.orgName)}</span>
          <span class="spacer"></span>
          <button class="bell" id="tb-bell" title="Alertas">🔔${n ? `<span class="dot">${n}</span>` : ""}</button>
          <div class="userchip" id="tb-user">
            <span class="avatar">${u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
            <span><div class="u-name">${esc(u.name)}</div><div class="u-role">${u.role === "admin" ? "Administrador" : "Usuário padrão"}</div></span>
          </div>
        </div>
        <div id="view"></div>
      </div>
      <nav class="bottombar no-print">
        ${[["#/inicio", "🏠", "Início"], ["#/equipamentos", "🔌", "Equipam."], ["#/alertas", "🔔", "Alertas"], ["#/relatorios", "📄", "Relatórios"], ["#/perfil", "👤", "Perfil"]]
          .map(([h, i, l]) => `<button data-nav="${h}" class="${path === h.slice(1) || (h !== "#/inicio" && path.startsWith(h.slice(1))) ? "active" : ""}">
            <span class="b-ico">${i}</span>${l}${h === "#/alertas" && n ? `<span class="b-dot">${n}</span>` : ""}</button>`).join("")}
      </nav>
    </div>`;
  }

  /* ---------- render ---------- */
  let tickFns = [];
  function onTick(fn) { tickFns.push(fn); }
  OHM.sim.onTick(() => tickFns.forEach((f) => { try { f(); } catch (e) {} }));

  function render() {
    tickFns = [];
    const raw = location.hash.replace(/^#/, "") || "/";
    const path = raw === "/" ? (currentUser ? "/inicio" : "/login") : raw;
    const match = matchRoute(path) || matchRoute("/inicio");

    if (!match.opts.public && !currentUser) { location.hash = "#/login"; return; }
    if (match.opts.admin && currentUser && currentUser.role !== "admin") {
      toast("Esta área é exclusiva do administrador.", "warn");
      location.hash = "#/inicio";
      return;
    }
    currentRoute = { path, match };

    if (match.opts.bare) {
      app.innerHTML = "";
      Views[match.view](app, match.params);
      return;
    }
    app.innerHTML = shellHtml(path);
    const bell = document.getElementById("tb-bell");
    if (bell) bell.addEventListener("click", () => go("#/alertas"));
    const chip = document.getElementById("tb-user");
    if (chip) chip.addEventListener("click", () => go("#/perfil"));
    document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => go(b.dataset.nav)));
    Views[match.view](document.getElementById("view"), match.params);
    window.scrollTo(0, 0);
  }

  function rerender() { if (currentRoute) render(); }

  /* ---------- API global para as views ---------- */
  window.UI = {
    esc, toast, modal, stateBadge, pageHeader,
    go, rerender, onTick,
    user: () => currentUser, setUser, toggleTheme,
    requestToggle, bulkShutdownFlow,
  };

  /* ---------- boot ---------- */
  initTheme();
  restoreUser();
  window.addEventListener("hashchange", render);
  render();
})();
