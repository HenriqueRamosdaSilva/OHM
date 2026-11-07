/* ============================================================
   OHM — views-action.js
   Telas: 7 Meus equipamentos · 8 Automações · 9 Criar/editar regra
          10 Central de alertas · 11 Detalhe do alerta · 12 Saúde
   ============================================================ */
(function () {
  "use strict";
  const V = (window.Views = window.Views || {});
  const H = 3600 * 1000, D = 24 * H;
  const DOWN = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  function daysPhrase(days) {
    if (!days || !days.length) return "todos os dias";
    const k = days.slice().sort().join(",");
    if (k === "1,2,3,4,5") return "de segunda a sexta";
    if (k === "0,1,2,3,4,5,6") return "todos os dias";
    if (k === "1,2,3,4,5,6") return "de segunda a sábado";
    return days.map((d) => DOWN[d]).join(", ");
  }
  function eqPhrase(eqIds) {
    const eqs = eqIds.map((id) => OHM.eq.byId(id)).filter(Boolean);
    if (!eqs.length) return "os equipamentos selecionados";
    if (eqs.length === 1) return eqs[0].name;
    const types = new Set(eqs.map((e) => e.type));
    if (types.size === 1) {
      const t = [...types][0];
      const plural = { ar: "os ares-condicionados", iluminacao: "as iluminações", maquina: "as máquinas", tomada: "as tomadas" }[t];
      return `${plural} (${eqs.length})`;
    }
    return `${eqs.length} equipamentos`;
  }
  V.ruleSummary = function (r) {
    const scope = r.scopeNodeId ? ` — ${OHM.loc.byId(r.scopeNodeId).name}` : "";
    const acts = [];
    if (r.actions.includes("desligar")) acts.push("desligar");
    if (r.actions.includes("alertar")) acts.push("avisar o responsável");
    const doPhrase = acts.join(" e ") || "nenhuma ação";
    if (r.trigger.kind === "horario")
      return `Às ${r.trigger.time}, ${daysPhrase(r.trigger.days)}: ${doPhrase} — ${eqPhrase(r.eqIds)}${scope}.`;
    if (r.trigger.kind === "ociosidade")
      return `Se houver consumo com o ambiente sem ocupação por ${r.trigger.minutes} minutos: ${doPhrase} — ${eqPhrase(r.eqIds)}${scope}.`;
    return `${doPhrase.charAt(0).toUpperCase() + doPhrase.slice(1)} ${eqPhrase(r.eqIds)}${scope} se religarem depois das ${r.trigger.after}, ${daysPhrase(r.trigger.days)}.`;
  };

  /* =========================================================
     TELA 7 — MEUS EQUIPAMENTOS E AÇÃO EM LOTE
     ========================================================= */
  V.meus = function (root) {
    const user = UI.user();
    const mine = OHM.equipments.filter((e) => OHM.perm.canControlEq(user, e));
    const onNow = mine.filter((e) => e.state === "on");

    root.innerHTML = `
      ${UI.pageHeader("Meus equipamentos", "Somente o que você pode controlar — pensado para o celular",
        onNow.length ? `<button class="btn danger lg" id="btn-encerrar">🌙 Encerrar expediente</button>` : "")}
      ${onNow.length ? `<div class="notice info mb">⚡ <span><b>${onNow.length} equipamento(s) ligado(s)</b> no seu escopo agora. “Encerrar expediente” desliga todos de uma vez, com confirmação e resultado item a item.</span></div>`
        : `<div class="notice info mb">✅ <span>Nenhum equipamento ligado no seu escopo. Bom descanso!</span></div>`}
      <div class="card">
        ${mine.length ? mine.map((e) => {
          const pend = e._pending;
          return `
          <div class="list-item">
            <div class="li-ico">${OHM.eqIcons[e.type]}</div>
            <div class="li-body" style="cursor:pointer" data-go="#/equipamentos/${e.id}">
              <div class="li-title">${e.name}</div>
              <div class="li-sub">${OHM.loc.byId(e.ambienteId).name} · ${e.online ? (e.state === "on" ? OHM.fmt.kw(e.currentKw) + " agora" : "desligado") : "⚠ offline — última leitura " + OHM.fmt.ago(e.lastSeen || Date.now())}</div>
            </div>
            <label class="switch ${pend ? "pending" : ""} ${!e.online ? "disabled" : ""}" title="${!e.online ? "Equipamento offline — comando indisponível" : e.state === "on" ? "Desligar" : "Ligar"}">
              <input type="checkbox" data-sw="${e.id}" ${e.state === "on" ? "checked" : ""} ${pend || !e.online ? "disabled" : ""}>
              <span class="track"><span class="knob"></span></span>
            </label>
          </div>`;
        }).join("") : `<div class="empty"><div class="e-ico">🔒</div>Nenhum equipamento controlável foi liberado para você.<br>Peça ao administrador da sua organização.</div>`}
      </div>
      <p class="muted small mt">O estado só muda quando o sensor confirma a queda de consumo — nunca apenas porque o botão foi tocado.</p>`;

    root.querySelectorAll("[data-go]").forEach((c) => c.addEventListener("click", () => UI.go(c.dataset.go)));
    root.querySelectorAll("[data-sw]").forEach((sw) =>
      sw.addEventListener("change", () => {
        const eq = OHM.eq.byId(sw.dataset.sw);
        UI.requestToggle(eq, eq.state === "on" ? "off" : "on", { channel: "app" });
      }));
    const be = root.querySelector("#btn-encerrar");
    if (be) be.addEventListener("click", () => UI.bulkShutdownFlow(onNow, "Encerrar expediente"));
  };

  /* =========================================================
     TELA 8 — AUTOMAÇÕES (lista de regras)
     ========================================================= */
  V.automacoes = function (root) {
    const totalSavings = OHM.rules.filter((r) => r.active).reduce((s, r) => s + r.estSavingsMonth, 0);
    root.innerHTML = `
      ${UI.pageHeader("Automações", "Regras que agem em nome da organização — toda ação automática fica registrada",
        `<button class="btn primary" id="btn-new">＋ Nova regra</button>`)}
      <div class="grid cols-3 mb">
        <div class="card"><div class="card-title">Regras ativas</div><div class="stat-value">${OHM.rules.filter((r) => r.active).length}<span class="muted" style="font-size:15px"> / ${OHM.rules.length}</span></div></div>
        <div class="card"><div class="card-title">Execuções acumuladas</div><div class="stat-value">${OHM.rules.reduce((s, r) => s + r.execCount, 0)}</div></div>
        <div class="card"><div class="card-title">Economia estimada</div><div class="stat-value" style="color:var(--good-text)">${OHM.fmt.brl(totalSavings)}<span class="muted" style="font-size:14px">/mês</span></div><div class="stat-sub">atribuída às regras ativas</div></div>
      </div>
      <div class="card">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Regra</th><th>Condição</th><th>Estado</th><th>Última execução</th><th class="num">Execuções</th><th class="num">Economia/mês</th><th></th></tr></thead>
          <tbody>
          ${OHM.rules.map((r) => `
            <tr>
              <td><b>${UI.esc(r.name)}</b><div class="small muted">${OHM.loc.byId(r.scopeNodeId) ? OHM.loc.pathOf(r.scopeNodeId) : ""}</div></td>
              <td class="small" style="max-width:300px">${UI.esc(V.ruleSummary(r))}</td>
              <td>
                <label class="switch" title="${r.active ? "Pausar" : "Ativar"}">
                  <input type="checkbox" data-rt="${r.id}" ${r.active ? "checked" : ""}>
                  <span class="track"><span class="knob"></span></span>
                </label>
              </td>
              <td class="small">${r.lastRun ? OHM.fmt.dt(r.lastRun) : "—"}</td>
              <td class="num">${r.execCount}</td>
              <td class="num" style="color:var(--good-text)"><b>${OHM.fmt.brl(r.estSavingsMonth)}</b></td>
              <td style="white-space:nowrap">
                <button class="btn sm" data-edit="${r.id}">Editar</button>
                ${r.trigger.kind === "evento" ? `<button class="btn sm primary" data-demo="${r.id}">▶ Simular</button>` : ""}
              </td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>
      <p class="muted small mt">💡 “Simular” demonstra o fluxo 4 do planejamento: alguém religa um ar às 22h, a regra o desliga de novo, registra no histórico e avisa o responsável — o que o temporizador comum não consegue fazer.</p>`;

    root.querySelector("#btn-new").addEventListener("click", () => UI.go("#/automacoes/nova"));
    root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => UI.go("#/automacoes/" + b.dataset.edit)));
    root.querySelectorAll("[data-rt]").forEach((sw) =>
      sw.addEventListener("change", () => {
        const r = OHM.rule.byId(sw.dataset.rt);
        r.active = sw.checked;
        OHM.sim.log({ userId: UI.user().id, channel: "web", action: r.active ? "ativar_regra" : "pausar_regra", eqId: null, note: r.name });
        UI.toast(`Regra “${r.name}” ${r.active ? "ativada" : "pausada"}.`, r.active ? "good" : "warn");
        UI.rerender();
      }));
    root.querySelectorAll("[data-demo]").forEach((b) =>
      b.addEventListener("click", () => runRuleDemo(OHM.rule.byId(b.dataset.demo))));

    function runRuleDemo(rule) {
      const m = UI.modal({
        title: "▶ Simulação — fluxo da regra automática",
        body: `<div id="demo-steps" class="timeline" style="min-height:120px"><div class="muted small">Iniciando cenário…</div></div>`,
        actions: [{ label: "Fechar", onClick: (c) => { c(); UI.rerender(); } }],
      });
      const box = m.root.querySelector("#demo-steps");
      box.innerHTML = "";
      OHM.sim.demoRuleEvent(rule, (step, text) => {
        const div = document.createElement("div");
        div.className = "tl-item " + (step === "falhou" ? "fail" : ["detectado", "comando", "desligado", "alertado"].includes(step) ? "auto" : "");
        div.innerHTML = `<div class="tl-when">${new Date().toLocaleTimeString("pt-BR")}</div><div class="small">${UI.esc(text)}</div>`;
        box.appendChild(div);
      });
    }
  };

  /* =========================================================
     TELA 9 — CRIAR E EDITAR REGRA (quando · se · então)
     ========================================================= */
  V.regraForm = function (root, params) {
    const editing = params.id && params.id !== "nova" ? OHM.rule.byId(params.id) : null;
    const key = params.id || "nova";
    if (!V.regraForm._draft || V.regraForm._key !== key) {
      V.regraForm._key = key;
      V.regraForm._draft = editing ? JSON.parse(JSON.stringify(editing)) : {
        id: "r" + Date.now(), name: "", active: true, scopeNodeId: "bloco-b", eqIds: [],
        trigger: { kind: "evento", event: "religado", after: "19:00", time: "19:00", minutes: 30, days: [1, 2, 3, 4, 5] },
        actions: ["desligar", "alertar"], exceptions: ["Feriados nacionais"], execCount: 0, lastRun: null, estSavingsMonth: 0,
      };
    }
    const d = V.regraForm._draft;
    const scopeAmbs = OHM.loc.ambientesUnder(d.scopeNodeId).map((a) => a.id);
    const candidates = OHM.equipments.filter((e) => scopeAmbs.includes(e.ambienteId) && (d.actions.includes("desligar") ? e.controllable : true));
    d.eqIds = d.eqIds.filter((id) => candidates.some((c) => c.id === id));

    root.innerHTML = `
      ${UI.pageHeader(editing ? "Editar regra" : "Nova regra", "Monte a regra no formato: quando · se · então")}
      <div class="grid cols-2">
        <div>
          <div class="card mb">
            <div class="field"><label>Nome da regra</label><input class="input" id="r-name" value="${UI.esc(d.name)}" placeholder="ex.: Desligar ares do Bloco B após o expediente"></div>
            <div class="field"><label>Escopo</label>
              <select class="input" id="r-scope">${OHM.locations.filter((l) => l.kind !== "unidade" || l.id === "matriz").map((l) => `<option value="${l.id}" ${l.id === d.scopeNodeId ? "selected" : ""}>${OHM.loc.pathOf(l.id)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="card mb">
            <div class="card-title">Quando (gatilho)</div>
            <div class="seg mb" id="r-kind">
              <button data-v="horario" class="${d.trigger.kind === "horario" ? "active" : ""}">⏰ Horário</button>
              <button data-v="ociosidade" class="${d.trigger.kind === "ociosidade" ? "active" : ""}">💤 Ociosidade</button>
              <button data-v="evento" class="${d.trigger.kind === "evento" ? "active" : ""}">⚡ Religamento</button>
            </div>
            ${d.trigger.kind === "horario" ? `
              <div class="field"><label>Às</label><input class="input" id="r-time" type="time" value="${d.trigger.time}" style="width:130px"></div>` : ""}
            ${d.trigger.kind === "ociosidade" ? `
              <div class="field"><label>Consumo acima de zero com o ambiente sem ocupação por</label>
              <div class="row"><input class="input" id="r-min" type="number" value="${d.trigger.minutes}" min="5" step="5" style="width:90px"> <span class="small muted">minutos</span></div></div>` : ""}
            ${d.trigger.kind === "evento" ? `
              <div class="field"><label>Equipamento religado depois das</label><input class="input" id="r-after" type="time" value="${d.trigger.after}" style="width:130px"></div>
              <p class="small muted">É este gatilho que resolve o problema do temporizador comum: se alguém religar às 22h, a regra desliga de novo.</p>` : ""}
            ${d.trigger.kind !== "ociosidade" ? `
            <div class="field"><label>Dias</label>
              <div class="row" id="r-days">${[1, 2, 3, 4, 5, 6, 0].map((dw) => `<label class="checkrow" style="margin:0 4px 0 0"><input type="checkbox" data-day="${dw}" ${d.trigger.days.includes(dw) ? "checked" : ""}> ${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dw]}</label>`).join("")}</div>
            </div>` : ""}
          </div>
          <div class="card mb">
            <div class="card-title">Então (ações)</div>
            <label class="checkrow"><input type="checkbox" id="r-act-off" ${d.actions.includes("desligar") ? "checked" : ""}> ⏻ Desligar os equipamentos</label>
            <label class="checkrow"><input type="checkbox" id="r-act-alert" ${d.actions.includes("alertar") ? "checked" : ""}> 🔔 Enviar alerta ao responsável</label>
          </div>
          <div class="card">
            <div class="card-title">Exceções por data</div>
            <label class="checkrow"><input type="checkbox" id="r-exc-fer" ${d.exceptions.includes("Feriados nacionais") ? "checked" : ""}> Feriados nacionais (${OHM.config.feriados.length} cadastrados)</label>
            <label class="checkrow"><input type="checkbox" id="r-exc-ev" ${d.exceptions.includes("Eventos cadastrados") ? "checked" : ""}> Eventos cadastrados pela organização</label>
          </div>
        </div>
        <div>
          <div class="card mb">
            <div class="card-title">Equipamentos no escopo ${d.actions.includes("desligar") ? "<span class='hint'>somente controláveis</span>" : ""}</div>
            ${candidates.length ? candidates.map((e) => `
              <label class="checkrow"><input type="checkbox" data-eq="${e.id}" ${d.eqIds.includes(e.id) ? "checked" : ""}>
                ${OHM.eqIcons[e.type]} ${e.name} <span class="muted small">· ${OHM.loc.byId(e.ambienteId).name}</span>
                ${e.critical ? '<span class="badge critico">crítico</span>' : ""}</label>`).join("")
            : `<div class="empty">Nenhum equipamento elegível neste escopo.</div>`}
            ${candidates.some((e) => d.eqIds.includes(e.id) && e.critical) ? `<div class="notice warn mt">⚠️ <span>Há equipamento <b>crítico</b> selecionado. Regras não desligam máquinas críticas durante ciclo de produção (intertravamento de Engenharia).</span></div>` : ""}
          </div>
          <div class="card mb" style="border-left:4px solid var(--accent)">
            <div class="card-title">Resumo em linguagem natural</div>
            <p id="r-summary" style="font-size:15px;font-weight:600">${UI.esc(V.ruleSummary(d))}</p>
            <p class="small muted mt">Confira se o resumo descreve exatamente o que você quer antes de salvar.</p>
          </div>
          <div class="row">
            <button class="btn primary lg" id="r-save">💾 Salvar regra</button>
            <button class="btn lg" id="r-cancel">Cancelar</button>
          </div>
        </div>
      </div>`;

    const refresh = () => UI.rerender();
    const summary = () => { root.querySelector("#r-summary").textContent = V.ruleSummary(d); };

    root.querySelector("#r-name").addEventListener("input", (e) => { d.name = e.target.value; });
    root.querySelector("#r-scope").addEventListener("change", (e) => { d.scopeNodeId = e.target.value; refresh(); });
    root.querySelector("#r-kind").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { d.trigger.kind = b.dataset.v; refresh(); }));
    const bind = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener("change", (e) => { fn(e); summary(); }); };
    bind("#r-time", (e) => (d.trigger.time = e.target.value));
    bind("#r-after", (e) => (d.trigger.after = e.target.value));
    bind("#r-min", (e) => (d.trigger.minutes = +e.target.value));
    root.querySelectorAll("[data-day]").forEach((c) =>
      c.addEventListener("change", () => {
        const dw = +c.dataset.day;
        d.trigger.days = c.checked ? d.trigger.days.concat(dw) : d.trigger.days.filter((x) => x !== dw);
        summary();
      }));
    bind("#r-act-off", (e) => { d.actions = d.actions.filter((a) => a !== "desligar"); if (e.target.checked) d.actions.push("desligar"); refresh(); });
    bind("#r-act-alert", (e) => { d.actions = d.actions.filter((a) => a !== "alertar"); if (e.target.checked) d.actions.push("alertar"); });
    bind("#r-exc-fer", (e) => { d.exceptions = d.exceptions.filter((x) => x !== "Feriados nacionais"); if (e.target.checked) d.exceptions.push("Feriados nacionais"); });
    bind("#r-exc-ev", (e) => { d.exceptions = d.exceptions.filter((x) => x !== "Eventos cadastrados"); if (e.target.checked) d.exceptions.push("Eventos cadastrados"); });
    root.querySelectorAll("[data-eq]").forEach((c) =>
      c.addEventListener("change", () => {
        d.eqIds = c.checked ? d.eqIds.concat(c.dataset.eq) : d.eqIds.filter((x) => x !== c.dataset.eq);
        summary();
      }));

    root.querySelector("#r-cancel").addEventListener("click", () => { V.regraForm._draft = null; UI.go("#/automacoes"); });
    root.querySelector("#r-save").addEventListener("click", () => {
      d.name = root.querySelector("#r-name").value.trim();
      if (!d.name) { UI.toast("Dê um nome à regra.", "bad"); return; }
      if (!d.eqIds.length) { UI.toast("Selecione ao menos um equipamento.", "bad"); return; }
      if (!d.actions.length) { UI.toast("Escolha ao menos uma ação (desligar e/ou alertar).", "bad"); return; }
      if (editing) Object.assign(editing, d);
      else { d.estSavingsMonth = Math.round(40 + d.eqIds.length * 35); OHM.rules.push(d); }
      OHM.sim.log({ userId: UI.user().id, channel: "web", action: editing ? "editar_regra" : "criar_regra", eqId: null, note: d.name });
      UI.toast(`Regra “${d.name}” salva.`, "good");
      V.regraForm._draft = null;
      UI.go("#/automacoes");
    });
  };

  /* =========================================================
     TELA 10 — CENTRAL DE ALERTAS
     ========================================================= */
  V.alertas = function (root) {
    const user = UI.user();
    const state = V.alertas._s || (V.alertas._s = { estado: "abertos", tipo: "", amb: "" });
    const vis = new Set(OHM.perm.visibleEquipments(user).map((e) => e.id));
    const sevRank = { critico: 0, atencao: 1 };
    let list = OHM.alerts.filter((a) => vis.has(a.eqId));
    const silencedCount = list.filter((a) => a.silenced).length;

    if (state.estado === "abertos") list = list.filter((a) => a.state !== "resolvido" && !a.silenced);
    else if (state.estado === "resolvidos") list = list.filter((a) => a.state === "resolvido");
    else if (state.estado === "silenciados") list = list.filter((a) => a.silenced);
    if (state.tipo) list = list.filter((a) => a.type === state.tipo);
    if (state.amb) list = list.filter((a) => OHM.eq.byId(a.eqId).ambienteId === state.amb);
    list.sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || b.since - a.since);

    const typeNames = { desvio: "Consumo acima do esperado", fora_horario: "Ligado fora do horário", sensor_offline: "Sensor offline", regra_falhou: "Regra falhou" };

    root.innerHTML = `
      ${UI.pageHeader("Central de alertas", "Tudo que o sistema detectou, por gravidade e data")}
      <div class="filterbar">
        <div class="seg" id="a-estado">
          <button data-v="abertos" class="${state.estado === "abertos" ? "active" : ""}">Abertos</button>
          <button data-v="resolvidos" class="${state.estado === "resolvidos" ? "active" : ""}">Resolvidos</button>
          <button data-v="silenciados" class="${state.estado === "silenciados" ? "active" : ""}">Silenciados (${silencedCount})</button>
        </div>
        <select class="input" id="a-tipo"><option value="">Todos os tipos</option>${Object.entries(typeNames).map(([k, v]) => `<option value="${k}" ${state.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <select class="input" id="a-amb"><option value="">Todos os ambientes</option>${OHM.perm.visibleAmbientes(user).map((a) => `<option value="${a.id}" ${state.amb === a.id ? "selected" : ""}>${a.name}</option>`).join("")}</select>
      </div>
      <div class="card">
        ${list.length ? list.map((a) => {
          const eq = OHM.eq.byId(a.eqId);
          return `
          <div class="alert-row" data-go="#/alertas/${a.id}">
            <div class="sev-bar ${a.state === "resolvido" ? "resolvido" : a.severity}"></div>
            <div class="li-body">
              <div class="li-title">${a.title} ${a.silenced ? '<span class="badge neutro">🔇 silenciado</span>' : ""}</div>
              <div class="li-sub">${OHM.eqIcons[eq.type]} ${eq.name} · ${OHM.loc.byId(eq.ambienteId).name} · ${typeNames[a.type]}</div>
            </div>
            <div class="li-end">
              <span class="badge ${a.severity === "critico" ? "critico" : "atencao"}">${a.severity === "critico" ? "crítico" : "atenção"}</span>
              <span class="badge ${a.state}">${a.state === "analise" ? "em análise" : a.state}</span>
              <div class="small muted" style="margin-top:4px">${OHM.fmt.ago(a.since)}</div>
            </div>
          </div>`;
        }).join("") : `<div class="empty"><div class="e-ico">🎉</div>Nenhum alerta ${state.estado === "abertos" ? "aberto" : state.estado} com esses filtros.</div>`}
      </div>
      <p class="muted small mt">Para evitar excesso de notificações, alertas recorrentes podem ser silenciados com justificativa — um sistema que alerta demais passa a ser ignorado.</p>`;

    root.querySelector("#a-estado").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { state.estado = b.dataset.v; UI.rerender(); }));
    root.querySelector("#a-tipo").addEventListener("change", (e) => { state.tipo = e.target.value; UI.rerender(); });
    root.querySelector("#a-amb").addEventListener("change", (e) => { state.amb = e.target.value; UI.rerender(); });
    root.querySelectorAll("[data-go]").forEach((r) => r.addEventListener("click", () => UI.go(r.dataset.go)));
  };

  /* =========================================================
     TELA 11 — DETALHE DO ALERTA E DIAGNÓSTICO
     ========================================================= */
  V.alertaDetail = function (root, params) {
    const user = UI.user();
    const a = OHM.alert.byId(params.id);
    if (!a) { UI.go("#/alertas"); return; }
    const eq = OHM.eq.byId(a.eqId);
    const days = Math.max(1, Math.round((Date.now() - a.since) / D));
    const extraTotal = a.extraCostPerDay ? a.extraCostPerDay * days : null;
    const canCtrl = OHM.perm.canControlEq(user, eq);
    const maint = OHM.maints.find((m) => m.alertId === a.id);

    root.innerHTML = `
      ${UI.pageHeader(a.title,
        `${OHM.eqIcons[eq.type]} ${eq.name} · ${OHM.loc.pathOf(eq.ambienteId)}`,
        `<span class="badge ${a.severity === "critico" ? "critico" : "atencao"}">${a.severity === "critico" ? "crítico" : "atenção"}</span>
         <span class="badge ${a.state}">${a.state === "analise" ? "em análise" : a.state}</span>`)}
      <div class="grid cols-4 mb">
        <div class="card"><div class="card-title">Desde</div><div class="stat-value" style="font-size:18px">${OHM.fmt.dt(a.since)}</div><div class="stat-sub">${OHM.fmt.ago(a.since)} (${days} dia${days > 1 ? "s" : ""})</div></div>
        ${a.deviationPct ? `<div class="card"><div class="card-title">Desvio</div><div class="stat-value" style="color:var(--critical)">+${a.deviationPct}%</div><div class="stat-sub">acima da linha de base (limite: ${a.severity === "critico" ? OHM.config.limiteCritico : OHM.config.limiteAtencao}%)</div></div>` : ""}
        ${a.extraCostPerDay ? `<div class="card"><div class="card-title">Custo extra</div><div class="stat-value">${OHM.fmt.brl(a.extraCostPerDay)}<span class="muted" style="font-size:13px">/dia</span></div><div class="stat-sub">≈ ${OHM.fmt.brl(extraTotal)} acumulados</div></div>` : ""}
        <div class="card"><div class="card-title">Equipamento</div><div class="mt">${UI.stateBadge(eq)}</div><div class="stat-sub"><a href="#/equipamentos/${eq.id}">abrir ficha completa</a></div></div>
      </div>
      ${a.type !== "sensor_offline" ? `
      <div class="card mb">
        <div class="card-title">Consumo real × esperado — últimas 72 h</div>
        <div id="al-chart"></div>
      </div>` : ""}
      <div class="grid cols-2 mb">
        <div class="card">
          <div class="card-title">O que aconteceu</div>
          <p class="small">${a.detail}</p>
          ${a.state === "resolvido" && a.resolvedAt ? `<div class="notice info mt">✅ <span>Resolvido em ${OHM.fmt.dt(a.resolvedAt)}.</span></div>` : ""}
        </div>
        <div class="card">
          <div class="card-title">Leitura técnica — causas prováveis <span class="hint">validada pela Engenharia Mecânica</span></div>
          <ul class="small" style="margin:0;padding-left:18px">${a.causes.map((c) => `<li style="margin-bottom:6px">${c}</li>`).join("")}</ul>
          ${maint ? `<div class="notice ${maint.status === "executada" ? "info" : "warn"} mt">${maint.status === "executada" ? "✅" : "🔧"} <span>Recomendação <b>${maint.id.toUpperCase()}</b>: ${maint.action} — <a href="#/saude">${maint.status === "executada" ? "executada, resultado comprovado" : "aberta em Saúde e manutenção"}</a></span></div>` : ""}
        </div>
      </div>
      <div class="card no-print">
        <div class="card-title">Ações</div>
        <div class="row">
          ${eq.controllable && canCtrl && a.state !== "resolvido" ? `<button class="btn danger" id="al-off" ${!eq.online || eq.state !== "on" ? "disabled title='Equipamento " + (eq.online ? "já desligado" : "offline") + "'" : ""}>⏻ Desligar o equipamento</button>` : ""}
          ${!maint && a.state !== "resolvido" ? `<button class="btn" id="al-maint">🔧 Abrir recomendação de manutenção</button>` : ""}
          ${a.state === "novo" ? `<button class="btn" id="al-ana">🔎 Marcar como em análise</button>` : ""}
          ${a.state !== "resolvido" ? `<button class="btn primary" id="al-res">✅ Marcar como resolvido</button>` : ""}
          ${a.state !== "resolvido" && !a.silenced ? `<button class="btn ghost" id="al-sil">🔇 Silenciar alerta recorrente</button>` : ""}
          ${a.silenced ? `<button class="btn" id="al-unsil">🔔 Reativar notificações</button>` : ""}
        </div>
      </div>`;

    const q = (s) => root.querySelector(s);
    if (a.type !== "sensor_offline") {
      const real = OHM.sim.series([eq.id], OHM.sim.histEnd - 72 * H, OHM.sim.histEnd, 1);
      const base = OHM.sim.series([eq.id], OHM.sim.histEnd - 72 * H, OHM.sim.histEnd, 1, true);
      OHMCharts.lineChart(q("#al-chart"), {
        series: [{ points: real.pts, label: "Consumo real" }],
        band: { lo: base.pts.map((v) => v * 0.8), hi: base.pts.map((v) => v * 1.2), label: "Faixa esperada (±20%)" },
        labels: real.labels, unit: "kW", height: 230,
      });
    }
    if (q("#al-off")) q("#al-off").addEventListener("click", () => UI.requestToggle(eq, "off", { channel: "web" }));
    if (q("#al-ana")) q("#al-ana").addEventListener("click", () => { a.state = "analise"; OHM.sim.log({ userId: user.id, channel: "web", action: "alerta_analise", eqId: eq.id, note: a.title }); UI.rerender(); });
    if (q("#al-res")) q("#al-res").addEventListener("click", () => {
      a.state = "resolvido"; a.resolvedAt = Date.now();
      OHM.sim.log({ userId: user.id, channel: "web", action: "alerta_resolvido", eqId: eq.id, note: a.title });
      UI.toast("Alerta marcado como resolvido.", "good"); UI.rerender();
    });
    if (q("#al-maint")) q("#al-maint").addEventListener("click", () => {
      const sugestao = eq.type === "ar" ? "Limpeza de filtros e verificação de gás refrigerante" : eq.type === "maquina" ? "Inspeção de desgaste, atrito e obstrução" : "Inspeção elétrica do ponto";
      UI.modal({
        title: "Abrir recomendação de manutenção",
        body: `<div class="field"><label>Serviço recomendado</label><input class="input" id="mn-act" value="${sugestao}"></div>
               <p class="small muted">Após a execução, o OHM acompanha se o consumo volta à faixa normal — comprovando o resultado da manutenção.</p>`,
        actions: [
          { label: "Cancelar", onClick: (c) => c() },
          { label: "Criar recomendação", kind: "primary", onClick: (c) => {
              OHM.maints.push({ id: "m" + (OHM.maints.length + 1), eqId: eq.id, alertId: a.id, action: document.querySelector("#mn-act").value, status: "aberta", createdAt: Date.now() });
              OHM.sim.log({ userId: user.id, channel: "web", action: "manutencao", eqId: eq.id, note: "Recomendação aberta a partir do alerta " + a.id });
              c(); UI.toast("Recomendação criada — veja em Saúde e manutenção.", "good"); UI.rerender();
            } },
        ],
      });
    });
    if (q("#al-sil")) q("#al-sil").addEventListener("click", () => {
      UI.modal({
        title: "Silenciar alerta recorrente",
        body: `<p class="small muted">O silenciamento exige justificativa, que fica registrada para auditoria.</p>
               <div class="field mt"><label>Justificativa (obrigatória)</label><textarea class="input" id="sil-just" rows="3" placeholder="ex.: equipamento em manutenção programada até 15/10"></textarea></div>`,
        actions: [
          { label: "Cancelar", onClick: (c) => c() },
          { label: "Silenciar", kind: "primary", onClick: (c) => {
              const just = document.querySelector("#sil-just").value.trim();
              if (!just) { UI.toast("A justificativa é obrigatória.", "bad"); return; }
              a.silenced = true; a.silenceReason = just;
              OHM.sim.log({ userId: user.id, channel: "web", action: "silenciar_alerta", eqId: eq.id, note: just });
              c(); UI.toast("Alerta silenciado com justificativa registrada.", "warn"); UI.go("#/alertas");
            } },
        ],
      });
    });
    if (q("#al-unsil")) q("#al-unsil").addEventListener("click", () => { a.silenced = false; UI.rerender(); });
  };

  /* =========================================================
     TELA 12 — SAÚDE E MANUTENÇÃO
     ========================================================= */
  V.saude = function (root) {
    const machines = OHM.equipments.filter((e) => e.type === "maquina" || e.type === "ar");
    const weeklyRatio = (eq) => {
      const out = [];
      for (let w = 3; w >= 0; w--) {
        const to = OHM.sim.histEnd - w * 7 * D, from = to - 7 * D;
        const r = OHM.sim.sumRange([eq.id], from, to);
        const b = OHM.sim.sumRange([eq.id], from, to, true);
        out.push(b > 0 ? (r / b - 1) * 100 : 0);
      }
      return out;
    };
    const open = OHM.maints.filter((m) => m.status === "aberta");
    const done = OHM.maints.filter((m) => m.status === "executada");

    root.innerHTML = `
      ${UI.pageHeader("Saúde e manutenção", "Evolução do desvio de consumo ao longo das semanas — manutenção preditiva")}
      <div class="grid cols-2 mb">
        <div class="card">
          <div class="card-title">Indicador de saúde por equipamento</div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Equipamento</th><th>Saúde</th><th>Desvio (4 semanas)</th><th class="num">Desvio atual</th></tr></thead>
            <tbody>
            ${machines.map((e) => {
              const h = OHM.sim.healthOf(e);
              const ratios = weeklyRatio(e);
              const cur = ratios[ratios.length - 1];
              return `<tr class="row-link" data-go="#/equipamentos/${e.id}">
                <td><b>${OHM.eqIcons[e.type]} ${e.name}</b><div class="small muted">${OHM.loc.byId(e.ambienteId).name}</div></td>
                <td><span class="health ${h}"><span class="h-dot"></span>${h === "normal" ? "Normal" : h === "atencao" ? "Atenção" : "Crítico"}</span></td>
                <td><span class="spark" data-eq="${e.id}"></span></td>
                <td class="num" style="color:${cur > 15 ? "var(--critical)" : cur > 5 ? "#8a6200" : "var(--good-text)"}"><b>${OHM.fmt.pct(cur, true)}</b></td>
              </tr>`;
            }).join("")}
            </tbody>
          </table></div>
        </div>
        <div>
          <div class="card mb">
            <div class="card-title">Recomendações abertas (${open.length})</div>
            ${open.length ? open.map((m) => {
              const eq = OHM.eq.byId(m.eqId);
              return `<div class="list-item">
                <div class="li-ico">🔧</div>
                <div class="li-body"><div class="li-title">${UI.esc(m.action)}</div><div class="li-sub">${eq.name} · aberta ${OHM.fmt.ago(m.createdAt)}</div></div>
                <button class="btn sm primary" data-done="${m.id}">Registrar executada</button>
              </div>`;
            }).join("") : `<div class="empty">Nenhuma recomendação aberta.</div>`}
          </div>
          <div class="card mb">
            <div class="card-title">Executadas — resultado comprovado</div>
            ${done.map((m) => {
              const eq = OHM.eq.byId(m.eqId);
              return `<div class="list-item">
                <div class="li-ico">✅</div>
                <div class="li-body"><div class="li-title">${UI.esc(m.action)}</div>
                  <div class="li-sub">${eq.name} · executada em ${OHM.fmt.d(m.doneAt)}</div>
                  ${m.result ? `<div class="small" style="color:var(--good-text)">${m.result}</div>` : `<div class="small muted">Acompanhando o retorno do consumo à faixa normal…</div>`}
                </div>
              </div>`;
            }).join("") || `<div class="empty">Nenhuma manutenção concluída ainda.</div>`}
          </div>
          <div class="card" style="border-left:4px solid var(--s2)">
            <div class="card-title">Candidato à troca</div>
            <div class="li-title">❄️ Ar-cond. Split Recepção (2016)</div>
            <p class="small mt">Consome ≈ <b>18% a mais</b> que um inverter novo equivalente — custo extra de ≈ <b>${OHM.fmt.brl(310)}/mês</b>.</p>
            <div class="table-wrap mt"><table class="tbl">
              <tr><td>Custo extra acumulado (12 meses)</td><td class="num"><b>${OHM.fmt.brl(310 * 12)}</b></td></tr>
              <tr><td>Equipamento novo (12.000 BTU inverter)</td><td class="num">${OHM.fmt.brl(2400)}</td></tr>
              <tr><td>Retorno do investimento</td><td class="num" style="color:var(--good-text)"><b>≈ 8 meses</b></td></tr>
            </table></div>
          </div>
        </div>
      </div>`;

    root.querySelectorAll("[data-go]").forEach((r) => r.addEventListener("click", () => UI.go(r.dataset.go)));
    const cvar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    root.querySelectorAll(".spark").forEach((s) => {
      const e = OHM.eq.byId(s.dataset.eq);
      const pts = weeklyRatio(e).map((v) => Math.max(0, v + 10));
      const h = OHM.sim.healthOf(e);
      OHMCharts.sparkline(s, pts, h === "critico" ? cvar("--critical") : h === "atencao" ? cvar("--warning") : cvar("--s3"));
    });
    root.querySelectorAll("[data-done]").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const m = OHM.maints.find((x) => x.id === b.dataset.done);
        m.status = "executada"; m.doneAt = Date.now();
        m.result = null; // o sistema passa a acompanhar o retorno à faixa normal
        OHM.sim.log({ userId: UI.user().id, channel: "web", action: "manutencao", eqId: m.eqId, note: `Recomendação ${m.id.toUpperCase()} registrada como executada` });
        UI.toast("Manutenção registrada — o OHM vai acompanhar se o consumo volta ao normal.", "good");
        UI.rerender();
      }));
  };
})();
