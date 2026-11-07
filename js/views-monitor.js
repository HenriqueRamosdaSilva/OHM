/* ============================================================
   OHM — views-monitor.js
   Telas: 1 Login · 2 Início · 3 Consumo · 4 Ambientes ·
          5 Equipamentos · 6 Detalhe do equipamento
   ============================================================ */
(function () {
  "use strict";
  const V = (window.Views = window.Views || {});
  const H = 3600 * 1000, D = 24 * H;

  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

  function eqCurrentKw(eq) {
    if (!eq.online) return null; // offline ≠ zero
    return eq.state === "off" ? 0 : eq.currentKw;
  }
  function ambienteStats(amb) {
    const eqs = OHM.equipments.filter((e) => e.ambienteId === amb.id);
    let kw = 0, on = 0, offline = 0;
    for (const e of eqs) {
      if (!e.online) { offline++; continue; }
      if (e.state === "on") { on++; kw += e.currentKw; }
      if (e.state === "standby") kw += e.currentKw;
    }
    const kwhToday = OHM.sim.sumRange(eqs.map((e) => e.id), startOfToday(), Date.now());
    return { eqs, kw, on, offline, kwhToday };
  }
  function openAlertsFor(user) {
    const vis = new Set(OHM.perm.visibleEquipments(user).map((e) => e.id));
    return OHM.alerts.filter((a) => a.state !== "resolvido" && !a.silenced && vis.has(a.eqId));
  }

  /* =========================================================
     TELA 1 — LOGIN E PRIMEIRO ACESSO
     ========================================================= */
  V.login = function (root) {
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="brand" style="padding:0 0 18px">
            <div class="brand-mark">Ω</div>
            <div><div class="brand-name">OHM</div><div class="brand-sub">medir · entender · agir</div></div>
          </div>
          <div class="card">
            <h2 style="margin-bottom:4px">Entrar</h2>
            <p class="muted small" style="margin-bottom:14px">O OHM é B2B: o acesso é sempre concedido pela sua organização, por convite.</p>
            <div class="field"><label>E-mail corporativo</label><input id="lg-email" class="input" type="email" placeholder="voce@empresa.com.br"></div>
            <div class="field"><label>Senha</label><input id="lg-pass" class="input" type="password" placeholder="••••••••"></div>
            <button id="lg-btn" class="btn primary block lg">Entrar</button>
            <div class="row mt" style="justify-content:space-between">
              <a href="javascript:void 0" id="lg-forgot" class="small">Esqueci minha senha</a>
              <a href="javascript:void 0" id="lg-invite" class="small">Primeiro acesso? Ativar convite</a>
            </div>
            <hr class="divider">
            <div class="small muted" style="margin-bottom:6px">Acesso rápido (demonstração)</div>
            <div class="persona-grid">
              ${OHM.users.filter((u) => u.active).map((u) => `
                <button class="persona" data-login="${u.id}">
                  <span class="avatar">${u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                  <span><b>${u.name}</b><br><span class="muted small">${u.title} · ${u.role === "admin" ? "Administrador" : "Usuário padrão"}</span></span>
                </button>`).join("")}
            </div>
          </div>
          <p class="muted small" style="text-align:center;margin-top:14px">Protótipo acadêmico — Projeto Sistema Mecânico · Estratégia Empresarial</p>
        </div>
      </div>`;

    function doLogin(user) { UI.setUser(user); UI.go("#/inicio"); UI.toast(`Bem-vindo(a), ${user.name.split(" ")[0]}!`, "good"); }
    root.querySelectorAll("[data-login]").forEach((b) =>
      b.addEventListener("click", () => doLogin(OHM.user.byId(b.dataset.login))));
    root.querySelector("#lg-btn").addEventListener("click", () => {
      const em = root.querySelector("#lg-email").value.trim().toLowerCase();
      const u = OHM.users.find((x) => x.email === em && x.active);
      if (!u) { UI.toast("E-mail não encontrado. Use um dos acessos de demonstração abaixo.", "bad"); return; }
      doLogin(u);
    });
    root.querySelector("#lg-forgot").addEventListener("click", () =>
      UI.toast("Enviamos um link de recuperação para o seu e-mail (simulado).", "good"));
    root.querySelector("#lg-invite").addEventListener("click", showInviteFlow);

    function showInviteFlow() {
      const m = UI.modal({
        title: "Ativar convite",
        body: `
          <p class="small muted">Sua organização cadastrou você no OHM. Informe o código recebido por e-mail.</p>
          <div class="field mt"><label>Código do convite</label><input id="inv-code" class="input" value="OHM-2026"></div>
          <div class="field"><label>Defina sua senha</label><input id="inv-pass" class="input" type="password" placeholder="mínimo 8 caracteres"></div>`,
        actions: [
          { label: "Cancelar", onClick: (close) => close() },
          { label: "Ativar", kind: "primary", onClick: (close) => {
              close();
              UI.modal({
                title: "Convite ativado ✅",
                body: `
                  <p class="small">Seu perfil é <b>Usuário padrão</b>. De acordo com o que o administrador liberou, você poderá:</p>
                  <ul class="small" style="margin:10px 0 0;padding-left:18px">
                    <li>Ver o consumo dos ambientes do seu escopo</li>
                    <li>Ligar e desligar os equipamentos controláveis do seu escopo</li>
                    <li>Receber alertas e gerar relatórios do seu escopo</li>
                  </ul>
                  <p class="small muted mt">Cadastros, regras e permissões ficam com o administrador.</p>`,
                actions: [{ label: "Entendi, entrar", kind: "primary", onClick: (c) => { c(); UI.setUser(OHM.user.byId("u-paola")); UI.go("#/inicio"); } }],
              });
            } },
        ],
      });
      m.root.querySelector("#inv-code").focus();
    }
  };

  /* =========================================================
     TELA 2 — INÍCIO (PAINEL PRINCIPAL)
     ========================================================= */
  V.inicio = function (root) {
    const user = UI.user();
    const eqs = OHM.perm.visibleEquipments(user);
    const eqIds = eqs.map((e) => e.id);
    const { totalKw, offlineCount } = OHM.sim.currentTotalKw(user);

    // variação vs média das semanas anteriores (mesma janela de 24h)
    const nowTs = Date.now();
    const cur = OHM.sim.sumRange(eqIds, nowTs - D, nowTs);
    let prev = 0;
    for (const w of [7, 14, 21]) prev += OHM.sim.sumRange(eqIds, nowTs - w * D - D, nowTs - w * D);
    prev /= 3;
    const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;

    const activeCount = eqs.filter((e) => e.online && e.state === "on").length;
    const alerts = openAlertsFor(user);
    const kwhToday = OHM.sim.sumRange(eqIds, startOfToday(), nowTs);

    const scopeNote = user.role === "admin" ? "Toda a organização" :
      "Seu escopo: " + user.scopes.map((s) => OHM.loc.byId(s.nodeId).name).join(", ");

    root.innerHTML = `
      ${UI.pageHeader("Início", scopeNote)}
      ${offlineCount ? `<div class="notice warn mb">⚠️ <span><b>${offlineCount} sensor(es) sem comunicação.</b> Os valores podem estar defasados — consumo de sensor offline não é tratado como zero. <a href="#/alertas">Ver alertas</a></span></div>` : ""}
      <div class="grid cols-4 mb">
        <div class="card" style="grid-column: span 2">
          <div class="card-title">Consumo atual <span class="hint">atualiza a cada poucos segundos</span></div>
          <div><span class="hero-value" id="hero-kw">${OHM.fmt.kw(totalKw).replace(" kW", "")}</span><span class="hero-unit">kW</span></div>
          <div class="mt row">
            <span class="delta ${delta <= -1 ? "down" : delta >= 1 ? "up" : "neutral"}">${delta <= -1 ? "▼" : delta >= 1 ? "▲" : "•"} ${OHM.fmt.pct(Math.abs(delta))}</span>
            <span class="muted small">vs. média das semanas anteriores</span>
          </div>
        </div>
        <div class="card clickable" data-go="#/equipamentos">
          <div class="card-title">Equipamentos ativos</div>
          <div class="stat-value">${activeCount}<span class="muted" style="font-size:15px"> / ${eqs.length}</span></div>
          <div class="stat-sub">monitorados no seu escopo</div>
        </div>
        <div class="card clickable" data-go="#/alertas">
          <div class="card-title">Alertas abertos</div>
          <div class="stat-value" style="color:${alerts.some((a) => a.severity === "critico") ? "var(--critical)" : "inherit"}">${alerts.length}</div>
          <div class="stat-sub">${alerts.filter((a) => a.severity === "critico").length} crítico(s) · ${alerts.filter((a) => a.severity === "atencao").length} atenção</div>
        </div>
      </div>
      <div class="grid cols-4 mb">
        <div class="card">
          <div class="card-title">Custo hoje</div>
          <div class="stat-value">${OHM.fmt.brl(kwhToday * OHM.config.tarifa)}</div>
          <div class="stat-sub">${OHM.fmt.kwh(kwhToday)} · tarifa ${OHM.fmt.brl(OHM.config.tarifa)}/kWh</div>
        </div>
        <div class="card">
          <div class="card-title">Ambiente</div>
          <div class="stat-value">${OHM.weather.temp.toLocaleString("pt-BR")} °C</div>
          <div class="stat-sub">umidade ${OHM.weather.hum}% · sensor externo</div>
        </div>
        <div class="card clickable" style="grid-column: span 2" data-go="${user.role === "admin" ? "#/consumo" : "#/meus"}">
          ${user.role === "admin"
            ? `<div class="card-title">Análise</div><div class="li-title">📊 Abrir análise de consumo</div><div class="stat-sub">períodos, comparações e consumo fora do expediente</div>`
            : `<div class="card-title">Ação rápida</div><div class="li-title">⚡ Meus equipamentos · Encerrar expediente</div><div class="stat-sub">desligue tudo do seu escopo em poucos toques</div>`}
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-title">Últimas 24 horas <span class="hint">kW médio por hora</span></div>
          <div id="chart-24h"></div>
        </div>
        <div class="card">
          <div class="card-title">Consumo por setor — hoje <span class="hint">clique para detalhar</span></div>
          <div id="chart-setores"></div>
        </div>
      </div>
      ${user.role === "admin" ? `
      <div class="card mt">
        <div class="card-title">Roteiro de demonstração <span class="hint">os 4 fluxos da seção 6 do planejamento</span></div>
        <div class="grid cols-4">
          <div class="card clickable" data-go="#/meus"><b>1 · Encerrar expediente</b><div class="small muted mt">Desligamento em lote com resultado por item (um falha por estar offline).</div></div>
          <div class="card clickable" data-go="#/alertas/a1"><b>2 · Anomalia de 35%</b><div class="small muted mt">Alerta crítico do ar-condicionado com diagnóstico e manutenção.</div></div>
          <div class="card clickable" data-go="#/consumo"><b>3 · Prestação de contas</b><div class="small muted mt">Consumo fora do expediente → relatório comparativo em PDF.</div></div>
          <div class="card clickable" data-go="#/automacoes"><b>4 · Regra automática</b><div class="small muted mt">Religamento às 22h desfeito pela regra, com registro e aviso.</div></div>
        </div>
      </div>` : ""}`;

    root.querySelectorAll("[data-go]").forEach((c) => c.addEventListener("click", () => UI.go(c.dataset.go)));

    const s24 = OHM.sim.series(eqIds, OHM.sim.histEnd - 24 * H, OHM.sim.histEnd, 1);
    OHMCharts.lineChart(root.querySelector("#chart-24h"), { series: [{ points: s24.pts, label: "Consumo" }], labels: s24.labels, unit: "kW", fill: true, height: 210 });

    const setores = OHM.locations.filter((l) => l.kind === "setor");
    const items = setores.map((s, i) => {
      const ambs = OHM.loc.ambientesUnder(s.id).filter((a) => OHM.perm.visibleAmbientes(user).some((v) => v.id === a.id));
      const ids = OHM.equipments.filter((e) => ambs.some((a) => a.id === e.ambienteId)).map((e) => e.id);
      return { label: s.name, value: OHM.sim.sumRange(ids, startOfToday(), nowTs), color: getComputedStyle(document.documentElement).getPropertyValue("--s" + ((i % 3) + 1)).trim(), sub: ambs.length + " ambiente(s)" };
    }).filter((x) => x.value > 0.01);
    if (items.length) OHMCharts.barChart(root.querySelector("#chart-setores"), { items, unit: "kWh" });
    else root.querySelector("#chart-setores").innerHTML = `<div class="empty"><div class="e-ico">📭</div>Sem dados ainda — organização recém-instalada.</div>`;

    UI.onTick(() => {
      const el = root.querySelector("#hero-kw");
      if (el) el.textContent = OHM.fmt.kw(OHM.sim.currentTotalKw(user).totalKw).replace(" kW", "");
    });
  };

  /* =========================================================
     TELA 3 — CONSUMO (análise profunda)
     ========================================================= */
  V.consumo = function (root) {
    const user = UI.user();
    const state = V.consumo._s || (V.consumo._s = { period: "7d", nodeId: "matriz", unit: "kWh", idle: false });
    if (user.role !== "admin" && state.nodeId === "matriz") state.nodeId = user.scopes[0].nodeId;

    const nodeOptions = user.role === "admin"
      ? [{ id: "matriz", label: "Organização inteira" }].concat(
          OHM.locations.filter((l) => l.id !== "matriz").map((l) => ({ id: l.id, label: `${"— ".repeat(l.kind === "bloco" ? 1 : l.kind === "setor" ? 2 : 3)}${l.name}` })))
      : OHM.perm.visibleAmbientes(user).map((a) => ({ id: a.id, label: a.name }))
          .concat(user.scopes.map((s) => ({ id: s.nodeId, label: OHM.loc.byId(s.nodeId).name + " (todo o escopo)" })));

    const ambs = OHM.loc.ambientesUnder(state.nodeId).filter((a) => OHM.perm.visibleAmbientes(user).some((v) => v.id === a.id));
    const eqIds = OHM.equipments.filter((e) => ambs.some((a) => a.id === e.ambienteId)).map((e) => e.id);

    const nowTs = Date.now();
    const ranges = { hoje: [startOfToday(), nowTs, 1], "7d": [nowTs - 7 * D, nowTs, 24], "28d": [nowTs - 28 * D, nowTs, 24] };
    const [from, to, stepH] = ranges[state.period];
    if (state.period !== "hoje" && state.unit === "kW") state.unit = "kWh";

    const idle = OHM.sim.idleShare(eqIds, from, to);
    const conv = (v) => (state.unit === "R$" ? v * OHM.config.tarifa : v);
    const unitLabel = state.unit === "kW" ? "kW" : state.unit === "R$" ? "R$" : "kWh";

    root.innerHTML = `
      ${UI.pageHeader("Consumo", "Análise por período, nível e unidade — a tela que sustenta a conversa com a diretoria")}
      <div class="filterbar">
        <div class="seg" id="f-period">
          <button data-v="hoje" class="${state.period === "hoje" ? "active" : ""}">Hoje</button>
          <button data-v="7d" class="${state.period === "7d" ? "active" : ""}">7 dias</button>
          <button data-v="28d" class="${state.period === "28d" ? "active" : ""}">28 dias</button>
        </div>
        <select class="input" id="f-node">${nodeOptions.map((o) => `<option value="${o.id}" ${o.id === state.nodeId ? "selected" : ""}>${o.label}</option>`).join("")}</select>
        <div class="seg" id="f-unit">
          <button data-v="kW" class="${state.unit === "kW" ? "active" : ""}" ${state.period !== "hoje" ? "disabled title='kW instantâneo disponível apenas para Hoje'" : ""}>kW</button>
          <button data-v="kWh" class="${state.unit === "kWh" ? "active" : ""}">kWh</button>
          <button data-v="R$" class="${state.unit === "R$" ? "active" : ""}">R$</button>
        </div>
        <label class="checkrow" style="margin:0"><input type="checkbox" id="f-idle" ${state.idle ? "checked" : ""}> Destacar consumo ocioso</label>
      </div>
      <div class="grid cols-3 mb">
        <div class="card"><div class="card-title">Total no período</div><div class="stat-value">${OHM.fmt.val(conv(idle.total), unitLabel === "kW" ? "kWh" : unitLabel)}</div><div class="stat-sub">${OHM.fmt.brl(idle.total * OHM.config.tarifa)} na tarifa atual</div></div>
        <div class="card"><div class="card-title">Fora do expediente</div><div class="stat-value" style="color:var(--s2)">${OHM.fmt.val(conv(idle.idle), unitLabel === "kW" ? "kWh" : unitLabel)}</div><div class="stat-sub">${OHM.fmt.pct(idle.total ? (idle.idle / idle.total) * 100 : 0)} do total · ${OHM.fmt.brl(idle.idle * OHM.config.tarifa)}</div></div>
        <div class="card"><div class="card-title">Potencial de economia</div><div class="stat-value" style="color:var(--good-text)">${OHM.fmt.brl(idle.idle * OHM.config.tarifa * 0.7)}</div><div class="stat-sub">≈ 70% do consumo ocioso é evitável com automações</div></div>
      </div>
      <div class="card mb">
        <div class="card-title">Consumo ao longo do tempo <span class="hint">${state.period === "hoje" ? "por hora" : "por dia"}</span></div>
        <div id="c-line"></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-title">Comparação entre ambientes</div><div id="c-bars"></div></div>
        <div class="card"><div class="card-title">Mapa de calor — hora × dia da semana <span class="hint">média de 4 semanas</span></div><div id="c-heat"></div></div>
      </div>`;

    root.querySelector("#f-period").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { state.period = b.dataset.v; UI.rerender(); }));
    root.querySelector("#f-unit").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { if (!b.disabled) { state.unit = b.dataset.v; UI.rerender(); } }));
    root.querySelector("#f-node").addEventListener("change", (e) => { state.nodeId = e.target.value; UI.rerender(); });
    root.querySelector("#f-idle").addEventListener("change", (e) => { state.idle = e.target.checked; UI.rerender(); });

    const s = OHM.sim.series(eqIds, from, to, stepH);
    OHMCharts.lineChart(root.querySelector("#c-line"), {
      series: [{ points: s.pts.map(conv), label: "Consumo" }], labels: s.labels,
      unit: unitLabel === "kW" ? "kW" : unitLabel, fill: true, height: 230,
    });

    const items = ambs.map((a) => {
      const ids = OHM.equipments.filter((e) => e.ambienteId === a.id).map((e) => e.id);
      return { label: a.name, value: conv(OHM.sim.sumRange(ids, from, to)), sub: OHM.loc.pathOf(a.id) };
    }).sort((x, y) => y.value - x.value);
    OHMCharts.barChart(root.querySelector("#c-bars"), { items, unit: unitLabel === "kW" ? "kWh" : unitLabel });

    const hm = OHM.sim.heatmapMatrix(eqIds, ambs.map((a) => a.id));
    OHMCharts.heatmap(root.querySelector("#c-heat"), { matrix: hm.matrix, idleMask: hm.idleMask, unit: "kWh", showIdle: state.idle });
  };

  /* =========================================================
     TELA 4 — AMBIENTES (lista e detalhe)
     ========================================================= */
  V.ambientes = function (root) {
    const user = UI.user();
    const ambs = OHM.perm.visibleAmbientes(user);
    const alertEq = new Set(OHM.alerts.filter((a) => a.state !== "resolvido" && !a.silenced).map((a) => a.eqId));

    root.innerHTML = `
      ${UI.pageHeader("Ambientes", user.role === "admin" ? "Todas as salas, setores e áreas" : "Ambientes do seu escopo")}
      <div class="grid cols-3">
        ${ambs.map((a) => {
          const st = ambienteStats(a);
          const hasAlert = st.eqs.some((e) => alertEq.has(e.id));
          return `
          <div class="card clickable" data-go="#/ambientes/${a.id}">
            <div class="row" style="justify-content:space-between">
              <h3>${a.name}</h3>
              ${hasAlert ? `<span class="badge critico">⚠ alerta</span>` : st.offline ? `<span class="badge offline">sensor offline</span>` : ""}
            </div>
            <div class="small muted">${OHM.loc.pathOf(a.id).split(" › ").slice(1, -1).join(" › ")}</div>
            <div class="row mt" style="gap:18px">
              <div><div class="stat-value" style="font-size:20px">${OHM.fmt.kw(st.kw)}</div><div class="stat-sub">agora</div></div>
              <div><div class="stat-value" style="font-size:20px">${OHM.fmt.kwh(st.kwhToday)}</div><div class="stat-sub">hoje</div></div>
              <div><div class="stat-value" style="font-size:20px">${st.on}<span class="muted" style="font-size:13px">/${st.eqs.length}</span></div><div class="stat-sub">ligados</div></div>
            </div>
          </div>`;
        }).join("")}
      </div>`;
    root.querySelectorAll("[data-go]").forEach((c) => c.addEventListener("click", () => UI.go(c.dataset.go)));
  };

  V.ambienteDetail = function (root, params) {
    const user = UI.user();
    const amb = OHM.loc.byId(params.id);
    if (!amb || !OHM.perm.visibleAmbientes(user).some((a) => a.id === amb.id)) { UI.go("#/ambientes"); return; }
    const st = ambienteStats(amb);
    const hr = amb.hours || { start: 8, end: 19, days: [1, 2, 3, 4, 5] };
    const controllables = st.eqs.filter((e) => OHM.perm.canControlEq(user, e) && e.state === "on");
    const people = OHM.users.filter((u) => u.active && (u.role === "admin" || OHM.perm.visibleAmbientes(u).some((a) => a.id === amb.id)));

    root.innerHTML = `
      ${UI.pageHeader(amb.name, OHM.loc.pathOf(amb.id), controllables.length ? `<button class="btn danger" id="amb-off">⏻ Desligar equipamentos do ambiente</button>` : "")}
      <div class="grid cols-4 mb">
        <div class="card"><div class="card-title">Agora</div><div class="stat-value">${OHM.fmt.kw(st.kw)}</div></div>
        <div class="card"><div class="card-title">Hoje</div><div class="stat-value">${OHM.fmt.kwh(st.kwhToday)}</div><div class="stat-sub">${OHM.fmt.brl(st.kwhToday * OHM.config.tarifa)}</div></div>
        <div class="card"><div class="card-title">Horário esperado</div><div class="stat-value" style="font-size:18px">${hr.start}h – ${hr.end}h</div><div class="stat-sub">${hr.days.map((d) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d]).join(", ")}</div></div>
        <div class="card"><div class="card-title">Pessoas com acesso</div><div class="stat-value">${people.length}</div><div class="stat-sub">${people.slice(0, 3).map((p) => p.name.split(" ")[0]).join(", ")}${people.length > 3 ? "…" : ""}</div></div>
      </div>
      <div class="card mb"><div class="card-title">Últimas 24 horas</div><div id="amb-chart"></div></div>
      <div class="card">
        <div class="card-title">Equipamentos (${st.eqs.length})</div>
        ${st.eqs.map((e) => `
          <div class="list-item" style="cursor:pointer" data-go="#/equipamentos/${e.id}">
            <div class="li-ico">${OHM.eqIcons[e.type]}</div>
            <div class="li-body"><div class="li-title">${e.name}</div><div class="li-sub">${OHM.eqTypeNames[e.type]}${e.controllable ? " · controlável" : " · apenas monitorado"}</div></div>
            <div class="li-end">${UI.stateBadge(e)}<div class="small muted mt" style="margin-top:4px">${e.online ? OHM.fmt.kw(eqCurrentKw(e)) : "última: " + OHM.fmt.kw(e.currentKw)}</div></div>
          </div>`).join("")}
      </div>`;

    root.querySelectorAll("[data-go]").forEach((c) => c.addEventListener("click", () => UI.go(c.dataset.go)));
    const s = OHM.sim.series(st.eqs.map((e) => e.id), OHM.sim.histEnd - 24 * H, OHM.sim.histEnd, 1);
    OHMCharts.lineChart(root.querySelector("#amb-chart"), { series: [{ points: s.pts, label: "Consumo" }], labels: s.labels, unit: "kW", fill: true, height: 200 });

    const offBtn = root.querySelector("#amb-off");
    if (offBtn) offBtn.addEventListener("click", () => UI.bulkShutdownFlow(controllables, `Desligar equipamentos — ${amb.name}`));
  };

  /* =========================================================
     TELA 5 — EQUIPAMENTOS (lista com ranking)
     ========================================================= */
  V.equipamentos = function (root) {
    const user = UI.user();
    const state = V.equipamentos._s || (V.equipamentos._s = { q: "", tipo: "", amb: "", estado: "", sort: "consumo" });
    let eqs = OHM.perm.visibleEquipments(user);
    const ambs = OHM.perm.visibleAmbientes(user);

    if (state.q) eqs = eqs.filter((e) => e.name.toLowerCase().includes(state.q.toLowerCase()));
    if (state.tipo) eqs = eqs.filter((e) => e.type === state.tipo);
    if (state.amb) eqs = eqs.filter((e) => e.ambienteId === state.amb);
    if (state.estado) eqs = eqs.filter((e) => (state.estado === "offline" ? !e.online : e.online && e.state === state.estado));
    eqs = eqs.slice().sort((a, b) => state.sort === "consumo" ? (eqCurrentKw(b) ?? b.currentKw) - (eqCurrentKw(a) ?? a.currentKw) : a.name.localeCompare(b.name));

    root.innerHTML = `
      ${UI.pageHeader("Equipamentos", "Ranking dos maiores consumidores — busque, filtre e ordene")}
      <div class="filterbar">
        <input class="input search" id="f-q" placeholder="🔍 Buscar equipamento…" value="${UI.esc(state.q)}">
        <select class="input" id="f-tipo"><option value="">Todos os tipos</option>${Object.entries(OHM.eqTypeNames).map(([k, v]) => `<option value="${k}" ${state.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <select class="input" id="f-amb"><option value="">Todos os ambientes</option>${ambs.map((a) => `<option value="${a.id}" ${state.amb === a.id ? "selected" : ""}>${a.name}</option>`).join("")}</select>
        <select class="input" id="f-estado"><option value="">Todos os estados</option><option value="on" ${state.estado === "on" ? "selected" : ""}>Ligado</option><option value="off" ${state.estado === "off" ? "selected" : ""}>Desligado</option><option value="standby" ${state.estado === "standby" ? "selected" : ""}>Standby</option><option value="offline" ${state.estado === "offline" ? "selected" : ""}>Offline</option></select>
        <div class="seg"><button data-v="consumo" class="${state.sort === "consumo" ? "active" : ""}">Por consumo</button><button data-v="nome" class="${state.sort === "nome" ? "active" : ""}">Por nome</button></div>
      </div>
      <div class="card">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>#</th><th>Equipamento</th><th>Ambiente</th><th>Estado</th><th></th><th class="num">Agora</th><th class="num">Hoje</th></tr></thead>
          <tbody>
            ${eqs.map((e, i) => {
              const kw = eqCurrentKw(e);
              return `<tr class="row-link" data-go="#/equipamentos/${e.id}">
                <td class="muted">${i + 1}</td>
                <td><b>${OHM.eqIcons[e.type]} ${e.name}</b><div class="small muted">${OHM.eqTypeNames[e.type]}</div></td>
                <td>${OHM.loc.byId(e.ambienteId).name}</td>
                <td>${UI.stateBadge(e)}</td>
                <td>${e.controllable ? `<span class="badge ctrl">controlável</span>` : `<span class="badge neutro">monitorado</span>`}${e.critical ? ` <span class="badge critico">crítico</span>` : ""}</td>
                <td class="num"><b>${kw === null ? "—" : OHM.fmt.kw(kw)}</b></td>
                <td class="num">${OHM.fmt.kwh(OHM.sim.sumRange([e.id], startOfToday(), Date.now()))}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table></div>
        ${!eqs.length ? `<div class="empty"><div class="e-ico">🔍</div>Nenhum equipamento encontrado com esses filtros.</div>` : ""}
      </div>`;

    root.querySelector("#f-q").addEventListener("input", (e) => { state.q = e.target.value; UI.rerender(true); });
    ["tipo", "amb", "estado"].forEach((k) =>
      root.querySelector("#f-" + k).addEventListener("change", (e) => { state[k] = e.target.value; UI.rerender(); }));
    root.querySelectorAll(".seg button").forEach((b) =>
      b.addEventListener("click", () => { state.sort = b.dataset.v; UI.rerender(); }));
    root.querySelectorAll("[data-go]").forEach((r) => r.addEventListener("click", () => UI.go(r.dataset.go)));
    const q = root.querySelector("#f-q");
    q.focus(); q.setSelectionRange(q.value.length, q.value.length);
  };

  /* =========================================================
     TELA 6 — DETALHE DO EQUIPAMENTO
     ========================================================= */
  V.equipDetail = function (root, params) {
    const user = UI.user();
    const eq = OHM.eq.byId(params.id);
    if (!eq || !OHM.perm.canSeeEq(user, eq)) { UI.go("#/equipamentos"); return; }

    const canCtrl = OHM.perm.canControlEq(user, eq);
    const month = OHM.sim.sumRange([eq.id], Date.now() - 28 * D, Date.now());
    const hoursOn = (() => {
      const arr = OHM.sim.hist[eq.id]; let h = 0;
      for (const v of arr) if (v > eq.nominalKw * 0.15) h++;
      return h;
    })();
    const health = OHM.sim.healthOf(eq);
    const rules = OHM.rules.filter((r) => r.eqIds.includes(eq.id));
    const alerts = OHM.alerts.filter((a) => a.eqId === eq.id).slice(0, 4);
    const actions = OHM.audit.filter((h) => h.eqId === eq.id).slice(0, 6);

    const ctrlButton = !eq.controllable ? "" : !canCtrl
      ? `<span class="badge neutro">sem permissão para controlar</span>`
      : eq._pending
        ? `<button class="btn primary" disabled><span class="spin"></span> aguardando confirmação…</button>`
        : eq.state === "on"
          ? `<button class="btn danger" id="eq-toggle">⏻ Desligar</button>`
          : `<button class="btn primary" id="eq-toggle">⏻ Ligar</button>`;

    root.innerHTML = `
      ${UI.pageHeader(`${OHM.eqIcons[eq.type]} ${eq.name}`,
        `${OHM.loc.pathOf(eq.ambienteId)} · ${OHM.eqTypeNames[eq.type]}${eq.btu ? " · " + eq.btu : ""}${eq.installYear ? " · instalado em " + eq.installYear : ""}`,
        `${UI.stateBadge(eq)} ${eq.critical ? '<span class="badge critico">equipamento crítico</span>' : ""} ${ctrlButton}`)}
      ${!eq.online ? `<div class="notice bad mb">📡 <span><b>Dispositivo sem comunicação${eq.lastSeen ? " desde " + OHM.fmt.dt(eq.lastSeen) : ""}.</b> A última leitura conhecida é exibida — não tratamos offline como consumo zero. Comandos remotos não estão disponíveis; pode ser necessário verificar no local.</span></div>` : ""}
      ${!eq.controllable ? `<div class="notice info mb">ℹ️ <span>Este ponto é <b>apenas monitorado</b> (sensor sem atuador). Para controle remoto seria necessário instalar um relé/contator ou módulo infravermelho.</span></div>` : ""}
      <div class="grid cols-4 mb">
        <div class="card"><div class="card-title">Consumo 28 dias</div><div class="stat-value">${OHM.fmt.kwh(month)}</div></div>
        <div class="card"><div class="card-title">Custo estimado</div><div class="stat-value">${OHM.fmt.brl(month * OHM.config.tarifa)}</div><div class="stat-sub">tarifa ${OHM.fmt.brl(OHM.config.tarifa)}/kWh</div></div>
        <div class="card"><div class="card-title">Horas de uso</div><div class="stat-value">${hoursOn} h</div><div class="stat-sub">últimos 28 dias</div></div>
        <div class="card"><div class="card-title">Saúde</div><div class="mt"><span class="health ${health}"><span class="h-dot"></span>${health === "normal" ? "Normal" : health === "atencao" ? "Atenção" : "Crítico"}</span></div><div class="stat-sub">${health !== "normal" ? '<a href="#/saude">ver em Saúde e manutenção</a>' : "comportamento dentro do histórico"}</div></div>
      </div>
      ${eq.type === "ar" && eq.online && eq.state === "on" ? `
      <div class="grid cols-4 mb">
        <div class="card"><div class="card-title">Temperatura ajustada</div><div class="stat-value">23 °C</div></div>
        <div class="card"><div class="card-title">Temperatura do ambiente</div><div class="stat-value">24,1 °C</div></div>
      </div>` : ""}
      <div class="card mb">
        <div class="card-title">Consumo × faixa esperada — últimas 48 h <span class="hint">a faixa vem do histórico do próprio equipamento</span></div>
        <div id="eq-chart"></div>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-title">Regras que afetam este equipamento</div>
          ${rules.length ? rules.map((r) => `
            <div class="list-item"><div class="li-ico">🤖</div>
              <div class="li-body"><div class="li-title">${UI.esc(r.name)}</div><div class="li-sub">${r.active ? "ativa" : "pausada"} · ${r.execCount} execuções</div></div>
              ${user.role === "admin" ? `<a href="#/automacoes/${r.id}" class="btn sm">abrir</a>` : ""}
            </div>`).join("") : `<div class="empty">Nenhuma regra configurada.</div>`}
          <div class="card-title" style="margin-top:16px">Alertas recentes</div>
          ${alerts.length ? alerts.map((a) => `
            <div class="list-item" style="cursor:pointer" data-go="#/alertas/${a.id}">
              <div class="sev-bar ${a.state === "resolvido" ? "resolvido" : a.severity}"></div>
              <div class="li-body"><div class="li-title">${a.title}</div><div class="li-sub">${OHM.fmt.ago(a.since)} · <span class="badge ${a.state}">${a.state}</span></div></div>
            </div>`).join("") : `<div class="empty">Nenhum alerta para este equipamento.</div>`}
        </div>
        <div class="card">
          <div class="card-title">Linha do tempo de ações <span class="hint">quem fez, quando e por onde</span></div>
          <div class="timeline">
            ${actions.length ? actions.map((h) => {
              const who = h.ruleId ? `Regra “${UI.esc((OHM.rule.byId(h.ruleId) || {}).name || "automática")}”` : (OHM.user.byId(h.userId) || {}).name || "Sistema";
              return `<div class="tl-item ${h.ruleId ? "auto" : ""} ${h.result === "falhou" ? "fail" : ""}">
                <div class="tl-when">${OHM.fmt.dt(h.ts)} · ${h.channel}</div>
                <div class="small"><b>${who}</b> — ${h.action.replace(/_/g, " ")} ${h.result === "falhou" ? "<span style='color:var(--critical)'>(falhou)</span>" : "✓"}</div>
                ${h.note ? `<div class="small muted">${UI.esc(h.note)}</div>` : ""}
              </div>`;
            }).join("") : `<div class="empty">Nenhuma ação registrada.</div>`}
          </div>
        </div>
      </div>`;

    root.querySelectorAll("[data-go]").forEach((c) => c.addEventListener("click", () => UI.go(c.dataset.go)));

    const real = OHM.sim.series([eq.id], OHM.sim.histEnd - 48 * H, OHM.sim.histEnd, 1);
    const base = OHM.sim.series([eq.id], OHM.sim.histEnd - 48 * H, OHM.sim.histEnd, 1, true);
    OHMCharts.lineChart(root.querySelector("#eq-chart"), {
      series: [{ points: real.pts, label: "Consumo real" }],
      band: { lo: base.pts.map((v) => v * 0.8), hi: base.pts.map((v) => v * 1.2), label: "Faixa esperada (±20%)" },
      labels: real.labels, unit: "kW", height: 230,
    });

    const tg = root.querySelector("#eq-toggle");
    if (tg) tg.addEventListener("click", () => UI.requestToggle(eq, eq.state === "on" ? "off" : "on", { channel: "web" }));
  };
})();
