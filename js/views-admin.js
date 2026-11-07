/* ============================================================
   OHM — views-admin.js
   Telas: 13 Relatórios · 14 Projeção · 15 Usuários · 16 Locais
          17 Dispositivos · 18 Configurações · 19 Histórico · 20 Perfil
   ============================================================ */
(function () {
  "use strict";
  const V = (window.Views = window.Views || {});
  const H = 3600 * 1000, D = 24 * H;

  /* =========================================================
     TELA 13 — RELATÓRIOS
     ========================================================= */
  V.relatorios = function (root) {
    const user = UI.user();
    const state = V.relatorios._s || (V.relatorios._s = { nodeId: user.role === "admin" ? "matriz" : user.scopes[0].nodeId, period: "7v7" });
    const nodeOptions = user.role === "admin"
      ? [{ id: "matriz", label: "Organização inteira" }].concat(OHM.locations.filter((l) => l.id !== "matriz").map((l) => ({ id: l.id, label: OHM.loc.pathOf(l.id) })))
      : user.scopes.map((s) => ({ id: s.nodeId, label: OHM.loc.pathOf(s.nodeId) }));

    const periods = {
      "7v7": { label: "Últimos 7 dias vs. 7 anteriores", span: 7 * D },
      "14v14": { label: "Últimas 2 semanas vs. 2 anteriores", span: 14 * D },
    };
    const span = periods[state.period].span;
    const nowTs = Date.now();
    const curFrom = nowTs - span, prevFrom = nowTs - 2 * span;

    const node = OHM.loc.byId(state.nodeId);
    const ambs = OHM.loc.ambientesUnder(state.nodeId).filter((a) => OHM.perm.visibleAmbientes(user).some((v) => v.id === a.id));
    const eqIds = OHM.equipments.filter((e) => ambs.some((a) => a.id === e.ambienteId)).map((e) => e.id);

    const cur = OHM.sim.sumRange(eqIds, curFrom, nowTs);
    const prev = OHM.sim.sumRange(eqIds, prevFrom, curFrom);
    const varPct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
    const saved = Math.max(0, prev - cur);

    // detalhe por nó filho (ou por equipamento, se nível = ambiente)
    const rows = (node.kind === "ambiente"
      ? OHM.equipments.filter((e) => e.ambienteId === node.id).map((e) => ({ name: e.name, ids: [e.id] }))
      : OHM.loc.children(state.nodeId).map((c) => ({
          name: c.name,
          ids: OHM.equipments.filter((e) => OHM.loc.ambientesUnder(c.id).some((a) => a.id === e.ambienteId)).map((e) => e.id),
        }))
    ).map((r) => {
      const c = OHM.sim.sumRange(r.ids, curFrom, nowTs);
      const p = OHM.sim.sumRange(r.ids, prevFrom, curFrom);
      return { ...r, cur: c, prev: p, var: p > 0 ? ((c - p) / p) * 100 : 0 };
    }).sort((a, b) => b.cur - a.cur);

    root.innerHTML = `
      ${UI.pageHeader("Relatórios", "Formato pensado para a diretoria: resumo, gráficos e detalhe", `
        <button class="btn" id="rp-csv">⬇ Planilha (CSV)</button>
        <button class="btn" id="rp-pdf">🖨 Exportar PDF</button>
        <button class="btn primary" id="rp-mail">📧 Agendar envio mensal</button>`)}
      <div class="filterbar no-print">
        <select class="input" id="rp-node">${nodeOptions.map((o) => `<option value="${o.id}" ${o.id === state.nodeId ? "selected" : ""}>${o.label}</option>`).join("")}</select>
        <select class="input" id="rp-period">${Object.entries(periods).map(([k, p]) => `<option value="${k}" ${state.period === k ? "selected" : ""}>${p.label}</option>`).join("")}</select>
      </div>
      <div class="card mb" id="report-area">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <div><h2>Relatório de energia — ${UI.esc(node.name)}</h2>
          <div class="small muted">${periods[state.period].label} · gerado em ${OHM.fmt.dt(nowTs)} · ${OHM.config.orgName}</div></div>
          <div class="brand-mark">Ω</div>
        </div>
        <div class="grid cols-4 mb">
          <div class="card"><div class="card-title">Consumo</div><div class="stat-value">${OHM.fmt.kwh(cur)}</div><div class="stat-sub">período anterior: ${OHM.fmt.kwh(prev)}</div></div>
          <div class="card"><div class="card-title">Custo</div><div class="stat-value">${OHM.fmt.brl(cur * OHM.config.tarifa)}</div><div class="stat-sub">tarifa ${OHM.fmt.brl(OHM.config.tarifa)}/kWh</div></div>
          <div class="card"><div class="card-title">Variação</div><div class="stat-value"><span class="delta ${varPct <= -1 ? "down" : varPct >= 1 ? "up" : "neutral"}">${varPct <= -1 ? "▼" : varPct >= 1 ? "▲" : "•"} ${OHM.fmt.pct(Math.abs(varPct))}</span></div><div class="stat-sub">vs. período anterior</div></div>
          <div class="card"><div class="card-title">Economia obtida</div><div class="stat-value" style="color:var(--good-text)">${OHM.fmt.brl(saved * OHM.config.tarifa)}</div><div class="stat-sub">${OHM.fmt.kwh(saved)} a menos que no período anterior</div></div>
        </div>
        <div class="card mb">
          <div class="card-title">Comparação diária</div>
          <div id="rp-chart"></div>
        </div>
        <div class="card">
          <div class="card-title">Detalhe por ${node.kind === "ambiente" ? "equipamento" : "área"}</div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>${node.kind === "ambiente" ? "Equipamento" : "Área"}</th><th class="num">Período atual</th><th class="num">Anterior</th><th class="num">Variação</th><th class="num">Custo</th></tr></thead>
            <tbody>${rows.map((r) => `
              <tr><td><b>${UI.esc(r.name)}</b></td>
              <td class="num">${OHM.fmt.kwh(r.cur)}</td>
              <td class="num muted">${OHM.fmt.kwh(r.prev)}</td>
              <td class="num" style="color:${r.var <= -1 ? "var(--good-text)" : r.var >= 1 ? "var(--critical)" : "var(--muted)"}">${OHM.fmt.pct(r.var, true)}</td>
              <td class="num"><b>${OHM.fmt.brl(r.cur * OHM.config.tarifa)}</b></td></tr>`).join("")}
            </tbody>
          </table></div>
        </div>
        <p class="small muted mt">Valores em reais calculados com a tarifa cadastrada (${OHM.fmt.brl(OHM.config.tarifa)}/kWh). Sensores offline não entram como consumo zero.</p>
      </div>`;

    root.querySelector("#rp-node").addEventListener("change", (e) => { state.nodeId = e.target.value; UI.rerender(); });
    root.querySelector("#rp-period").addEventListener("change", (e) => { state.period = e.target.value; UI.rerender(); });
    root.querySelector("#rp-pdf").addEventListener("click", () => window.print());
    root.querySelector("#rp-csv").addEventListener("click", () => {
      const lines = [["Area", "kWh atual", "kWh anterior", "Variacao %", "Custo R$"].join(";")]
        .concat(rows.map((r) => [r.name, r.cur.toFixed(1), r.prev.toFixed(1), r.var.toFixed(1), (r.cur * OHM.config.tarifa).toFixed(2)].join(";")));
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ohm-relatorio-${node.id}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    root.querySelector("#rp-mail").addEventListener("click", () =>
      UI.modal({
        title: "Agendar envio mensal",
        body: `<div class="field"><label>Enviar para</label><input class="input" value="diretoria@empresa.com.br"></div>
               <div class="field"><label>Dia do mês</label><select class="input" style="width:110px"><option>1</option><option>5</option><option>10</option></select></div>`,
        actions: [
          { label: "Cancelar", onClick: (c) => c() },
          { label: "Agendar", kind: "primary", onClick: (c) => { c(); UI.toast("Relatório mensal agendado — será enviado em PDF por e-mail.", "good"); } },
        ],
      }));

    const dCur = OHM.sim.series(eqIds, curFrom, nowTs, 24);
    const dPrev = OHM.sim.series(eqIds, prevFrom, curFrom, 24);
    OHMCharts.lineChart(root.querySelector("#rp-chart"), {
      series: [
        { points: dCur.pts, label: "Período atual" },
        { points: dPrev.pts, label: "Período anterior" },
      ],
      labels: dCur.labels, unit: "kWh", height: 220,
    });
  };

  /* =========================================================
     TELA 14 — PROJEÇÃO E SUGESTÕES DE ECONOMIA
     ========================================================= */
  V.projecao = function (root) {
    const user = UI.user();
    const eqIds = OHM.perm.visibleEquipments(user).map((e) => e.id);
    const p = OHM.sim.projection(eqIds);
    const ops = OHM.sim.opportunities();
    const totalOps = ops.reduce((s, o) => s + o.valueMonth, 0);

    root.innerHTML = `
      ${UI.pageHeader("Projeção e sugestões de economia", "Estimativa até o fim do mês com base no ritmo atual e no histórico")}
      <div class="notice info mb">ℹ️ <span>Os valores abaixo são <b>estimativas</b> calculadas com os dados reais de consumo e a tarifa cadastrada (${OHM.fmt.brl(OHM.config.tarifa)}/kWh).</span></div>
      <div class="grid cols-4 mb">
        <div class="card"><div class="card-title">Consumo no mês (até hoje)</div><div class="stat-value">${OHM.fmt.kwh(p.mtd)}</div><div class="stat-sub">dia ${p.dayOfMonth} de ${p.daysInMonth}</div></div>
        <div class="card"><div class="card-title">Custo no mês (até hoje)</div><div class="stat-value">${OHM.fmt.brl(p.costMtd)}</div></div>
        <div class="card"><div class="card-title">Projeção — consumo</div><div class="stat-value">${OHM.fmt.kwh(p.projected)}</div><div class="stat-sub">até o fim do mês</div></div>
        <div class="card"><div class="card-title">Projeção — custo</div><div class="stat-value">${OHM.fmt.brl(p.costProjected)}</div><div class="stat-sub">no ritmo atual</div></div>
      </div>
      <div class="card mb">
        <div class="card-title">Consumo diário — últimos 28 dias</div>
        <div id="pj-chart"></div>
      </div>
      <div class="card">
        <div class="card-title">Oportunidades de economia — priorizadas <span class="hint">potencial total: ${OHM.fmt.brl(totalOps)}/mês</span></div>
        ${ops.map((o, i) => `
          <div class="list-item">
            <div class="li-ico" style="background:var(--accent-soft);color:var(--accent);font-weight:800">${i + 1}</div>
            <div class="li-body">
              <div class="li-title">${o.title}</div>
              <div class="li-sub">${o.desc}</div>
              <div class="small mt" style="margin-top:4px">👉 <a href="${o.link}">${o.action}</a></div>
            </div>
            <div class="li-end"><div class="stat-value" style="font-size:19px;color:var(--good-text)">${OHM.fmt.brl(o.valueMonth)}</div><div class="stat-sub">${o.kwhMonth} kWh/mês</div></div>
          </div>`).join("")}
      </div>`;

    const s = OHM.sim.series(eqIds, Date.now() - 28 * D, Date.now(), 24);
    OHMCharts.lineChart(root.querySelector("#pj-chart"), { series: [{ points: s.pts, label: "Consumo diário" }], labels: s.labels, unit: "kWh", fill: true, height: 200 });
  };

  /* =========================================================
     TELA 15 — USUÁRIOS E PERMISSÕES
     ========================================================= */
  V.usuarios = function (root) {
    root.innerHTML = `
      ${UI.pageHeader("Usuários e permissões", "Perfil + escopo: quem vê e quem controla cada parte da organização",
        `<button class="btn primary" id="u-new">＋ Convidar usuário</button>`)}
      <div class="card">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Pessoa</th><th>Perfil</th><th>Escopos liberados</th><th>Último acesso</th><th>Status</th><th></th></tr></thead>
          <tbody>
          ${OHM.users.map((u) => `
            <tr style="${!u.active ? "opacity:.55" : ""}">
              <td><div class="row" style="gap:8px;flex-wrap:nowrap"><span class="avatar">${u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span><span><b>${u.name}</b><div class="small muted">${u.email}</div></span></div></td>
              <td>${u.role === "admin" ? '<span class="badge ctrl">Administrador</span>' : '<span class="badge neutro">Usuário padrão</span>'}</td>
              <td class="small">${u.role === "admin" ? "Toda a organização" : u.scopes.map((s) => `${OHM.loc.byId(s.nodeId).name} <span class="muted">(${[s.view ? "ver" : "", s.control ? "controlar" : ""].filter(Boolean).join(" + ")})</span>`).join("<br>") || "—"}</td>
              <td class="small">${OHM.fmt.ago(u.lastAccess)}</td>
              <td>${u.active ? '<span class="badge on">ativo</span>' : '<span class="badge off">desativado</span>'}</td>
              <td style="white-space:nowrap">
                <button class="btn sm" data-edit="${u.id}">Editar</button>
                <button class="btn sm ${u.active ? "" : "primary"}" data-toggle="${u.id}">${u.active ? "Desativar" : "Reativar"}</button>
              </td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>
      <p class="muted small mt">🔒 Desativar uma pessoa preserva todo o seu histórico de ações, como exige a auditoria (LGPD).</p>`;

    root.querySelector("#u-new").addEventListener("click", () => editUser(null));
    root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editUser(OHM.user.byId(b.dataset.edit))));
    root.querySelectorAll("[data-toggle]").forEach((b) =>
      b.addEventListener("click", () => {
        const u = OHM.user.byId(b.dataset.toggle);
        if (u.id === UI.user().id) { UI.toast("Você não pode desativar a si mesmo.", "bad"); return; }
        u.active = !u.active;
        OHM.sim.log({ userId: UI.user().id, channel: "web", action: u.active ? "reativar_usuario" : "desativar_usuario", eqId: null, note: `${u.name} — histórico preservado` });
        UI.toast(`${u.name} ${u.active ? "reativado(a)" : "desativado(a)"} — histórico preservado.`, u.active ? "good" : "warn");
        UI.rerender();
      }));

    function scopeTreeHtml(u) {
      const nodes = OHM.locations.filter((l) => l.kind !== "unidade");
      const has = (id, k) => u && u.scopes.some((s) => s.nodeId === id && s[k]);
      function branch(parentId, depth) {
        return OHM.loc.children(parentId).map((n) => `
          <div class="tree-row" style="margin-left:${depth * 18}px">
            <span style="flex:1"><span class="tree-kind">${n.kind}</span> <b>${n.name}</b></span>
            <label class="checkrow" style="margin:0"><input type="checkbox" data-view="${n.id}" ${has(n.id, "view") ? "checked" : ""}> ver</label>
            <label class="checkrow" style="margin:0"><input type="checkbox" data-ctrl="${n.id}" ${has(n.id, "control") ? "checked" : ""}> controlar</label>
          </div>${branch(n.id, depth + 1)}`).join("");
      }
      return `<div class="tree">${branch("matriz", 0)}</div>`;
    }

    function editUser(u) {
      const isNew = !u;
      const m = UI.modal({
        title: isNew ? "Convidar usuário" : "Editar usuário — " + u.name,
        body: `
          <div class="field"><label>Nome</label><input class="input" id="eu-name" value="${u ? UI.esc(u.name) : ""}"></div>
          <div class="field"><label>E-mail (receberá o convite)</label><input class="input" id="eu-email" value="${u ? u.email : ""}" ${isNew ? "" : "disabled"}></div>
          <div class="field"><label>Perfil</label>
            <div class="seg" id="eu-role">
              <button data-v="user" class="${!u || u.role === "user" ? "active" : ""}">Usuário padrão</button>
              <button data-v="admin" class="${u && u.role === "admin" ? "active" : ""}">Administrador</button>
            </div>
          </div>
          <div id="eu-scopes" style="${u && u.role === "admin" ? "display:none" : ""}">
            <label class="small" style="font-weight:650;color:var(--ink-2)">Escopo: marque o que a pessoa pode ver e controlar</label>
            ${scopeTreeHtml(u)}
          </div>`,
        actions: [
          { label: "Cancelar", onClick: (c) => c() },
          { label: isNew ? "Enviar convite" : "Salvar", kind: "primary", onClick: (c) => {
              const name = m.root.querySelector("#eu-name").value.trim();
              const email = m.root.querySelector("#eu-email").value.trim();
              if (!name || !email) { UI.toast("Preencha nome e e-mail.", "bad"); return; }
              const role = m.root.querySelector("#eu-role .active").dataset.v;
              const scopes = [];
              m.root.querySelectorAll("[data-view]").forEach((cb) => {
                const id = cb.dataset.view;
                const ctrl = m.root.querySelector(`[data-ctrl="${id}"]`).checked;
                if (cb.checked || ctrl) scopes.push({ nodeId: id, view: cb.checked || ctrl, control: ctrl });
              });
              if (role === "user" && !scopes.length) { UI.toast("Usuário padrão precisa de ao menos um escopo.", "bad"); return; }
              if (isNew) {
                OHM.users.push({ id: "u" + Date.now(), name, email, role, title: "Convite pendente", active: true, lastAccess: null, scopes });
                OHM.sim.log({ userId: UI.user().id, channel: "web", action: "cadastrar_usuario", eqId: null, note: `Convite enviado para ${email}` });
                UI.toast(`Convite enviado para ${email}.`, "good");
              } else {
                Object.assign(u, { name, role, scopes: role === "admin" ? [] : scopes });
                OHM.sim.log({ userId: UI.user().id, channel: "web", action: "editar_usuario", eqId: null, note: name });
                UI.toast("Permissões atualizadas.", "good");
              }
              c(); UI.rerender();
            } },
        ],
      });
      m.root.querySelectorAll("#eu-role button").forEach((b) =>
        b.addEventListener("click", () => {
          m.root.querySelectorAll("#eu-role button").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          m.root.querySelector("#eu-scopes").style.display = b.dataset.v === "admin" ? "none" : "";
        }));
    }
  };

  /* =========================================================
     TELA 16 — ESTRUTURA DE LOCAIS
     ========================================================= */
  V.locais = function (root) {
    root.innerHTML = `
      ${UI.pageHeader("Estrutura de locais", "Unidade → bloco → setor → ambiente. Relatórios, permissões e regras são aplicados sobre esta árvore.")}
      <div class="card" id="tree-root"></div>
      <p class="muted small mt">O horário de funcionamento esperado de cada ambiente alimenta a detecção de consumo ocioso.</p>`;

    const KIND_CHILD = { unidade: "bloco", bloco: "setor", setor: "ambiente" };
    const box = root.querySelector("#tree-root");

    function render() {
      function branch(parentId) {
        const kids = OHM.loc.children(parentId);
        if (!kids.length) return "";
        return `<div class="tree-children">${kids.map((n) => `
          <div class="tree-node">
            <div class="tree-row">
              <span class="tree-kind">${n.kind}</span>
              <b style="flex:1">${UI.esc(n.name)}</b>
              ${n.kind === "ambiente" && n.hours ? `<span class="small muted">🕒 ${n.hours.start}h–${n.hours.end}h</span>` : ""}
              ${KIND_CHILD[n.kind] ? `<button class="btn sm" data-add="${n.id}">＋ ${KIND_CHILD[n.kind]}</button>` : ""}
              <button class="btn sm" data-ren="${n.id}">✏️</button>
              ${n.kind === "ambiente" ? `<button class="btn sm" data-hr="${n.id}">🕒</button>` : ""}
              <button class="btn sm" data-arc="${n.id}" title="Arquivar">📦</button>
            </div>
            ${branch(n.id)}
          </div>`).join("")}</div>`;
      }
      const rootNode = OHM.loc.byId("matriz");
      box.innerHTML = `
        <div class="tree">
          <div class="tree-row"><span class="tree-kind">unidade</span><b style="flex:1">${rootNode.name}</b>
            <button class="btn sm" data-add="matriz">＋ bloco</button></div>
          ${branch("matriz")}
        </div>`;
      wire();
    }
    function wire() {
      box.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
        const parent = OHM.loc.byId(b.dataset.add);
        const kind = KIND_CHILD[parent.kind];
        UI.modal({
          title: `Novo ${kind} em “${parent.name}”`,
          body: `<div class="field"><label>Nome</label><input class="input" id="nn-name" placeholder="ex.: Bloco C"></div>`,
          actions: [
            { label: "Cancelar", onClick: (c) => c() },
            { label: "Criar", kind: "primary", onClick: (c) => {
                const name = document.querySelector("#nn-name").value.trim();
                if (!name) return;
                OHM.locations.push({ id: "loc" + Date.now(), name, kind, parentId: parent.id, hours: kind === "ambiente" ? { start: 8, end: 19, days: [1, 2, 3, 4, 5] } : undefined });
                OHM.sim.log({ userId: UI.user().id, channel: "web", action: "criar_local", eqId: null, note: `${kind} “${name}” em ${parent.name}` });
                c(); render();
              } },
          ],
        });
      }));
      box.querySelectorAll("[data-ren]").forEach((b) => b.addEventListener("click", () => {
        const n = OHM.loc.byId(b.dataset.ren);
        UI.modal({
          title: "Renomear",
          body: `<div class="field"><input class="input" id="rn-name" value="${UI.esc(n.name)}"></div>`,
          actions: [
            { label: "Cancelar", onClick: (c) => c() },
            { label: "Salvar", kind: "primary", onClick: (c) => { n.name = document.querySelector("#rn-name").value.trim() || n.name; c(); render(); } },
          ],
        });
      }));
      box.querySelectorAll("[data-hr]").forEach((b) => b.addEventListener("click", () => {
        const n = OHM.loc.byId(b.dataset.hr);
        const hr = n.hours || { start: 8, end: 19, days: [1, 2, 3, 4, 5] };
        UI.modal({
          title: `Horário de funcionamento — ${n.name}`,
          body: `
            <div class="row"><div class="field"><label>Abre</label><input class="input" id="hr-s" type="number" min="0" max="23" value="${hr.start}" style="width:80px"></div>
            <div class="field"><label>Fecha</label><input class="input" id="hr-e" type="number" min="1" max="24" value="${hr.end}" style="width:80px"></div></div>
            <div class="row">${[1, 2, 3, 4, 5, 6, 0].map((dw) => `<label class="checkrow" style="margin:0 4px 0 0"><input type="checkbox" data-hd="${dw}" ${hr.days.includes(dw) ? "checked" : ""}> ${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dw]}</label>`).join("")}</div>
            <p class="small muted mt">Consumo fora deste horário conta como ocioso.</p>`,
          actions: [
            { label: "Cancelar", onClick: (c) => c() },
            { label: "Salvar", kind: "primary", onClick: (c) => {
                const days = [...document.querySelectorAll("[data-hd]")].filter((x) => x.checked).map((x) => +x.dataset.hd);
                n.hours = { start: +document.querySelector("#hr-s").value, end: +document.querySelector("#hr-e").value, days };
                OHM.sim.log({ userId: UI.user().id, channel: "web", action: "configurar", eqId: null, note: `Horário de ${n.name}: ${n.hours.start}h–${n.hours.end}h` });
                c(); render();
              } },
          ],
        });
      }));
      box.querySelectorAll("[data-arc]").forEach((b) => b.addEventListener("click", () => {
        const n = OHM.loc.byId(b.dataset.arc);
        const eqCount = OHM.equipments.filter((e) => OHM.loc.ambientesUnder(n.id).some((a) => a.id === e.ambienteId)).length;
        UI.modal({
          title: `Arquivar “${n.name}”?`,
          body: `<p class="small">O nó sai das listas, mas o histórico é preservado. ${eqCount ? `<b>${eqCount} equipamento(s)</b> estão vinculados a esta parte da árvore.` : ""}</p>`,
          actions: [
            { label: "Cancelar", onClick: (c) => c() },
            { label: "Arquivar", kind: "danger", onClick: (c) => { n.archived = true; c(); UI.toast(`“${n.name}” arquivado.`, "warn"); render(); } },
          ],
        });
      }));
    }
    render();
  };

  /* =========================================================
     TELA 17 — DISPOSITIVOS E SENSORES
     ========================================================= */
  V.dispositivos = function (root) {
    const sigBars = (dbm) => dbm === null ? "—" : dbm > -55 ? "▂▄▆█ ótimo" : dbm > -65 ? "▂▄▆ bom" : "▂▄ fraco";
    root.innerHTML = `
      ${UI.pageHeader("Dispositivos e sensores", "Pareamento, associação e acompanhamento do hardware instalado",
        `<button class="btn primary" id="dv-pair">＋ Parear novo sensor</button>`)}
      <div class="card">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Sensor</th><th>Modelo</th><th>Equipamento associado</th><th>Ambiente</th><th>Conexão</th><th>Sinal</th><th>Última leitura</th></tr></thead>
          <tbody>
          ${OHM.devices.map((d) => {
            const eq = OHM.eq.byId(d.eqId);
            return `<tr style="${eq && !eq.online ? "background:rgba(208,59,59,.05)" : ""}">
              <td><b>${d.id}</b><div class="small muted">fw ${d.firmware}</div></td>
              <td class="small">${d.model}</td>
              <td>${eq ? `<a href="#/equipamentos/${eq.id}">${OHM.eqIcons[eq.type]} ${eq.name}</a>` : '<span class="muted">aguardando associação</span>'}</td>
              <td class="small">${eq ? OHM.loc.byId(eq.ambienteId).name : "—"}</td>
              <td>${eq && eq.online ? '<span class="badge on">online</span>' : '<span class="badge offline">offline</span>'}</td>
              <td class="small">${eq && eq.online ? `${sigBars(d.signal)} <span class="muted">(${d.signal} dBm)</span>` : "—"}</td>
              <td class="small">${eq ? (eq.online ? "agora" : OHM.fmt.ago(eq.lastSeen || Date.now() - 7200000)) : "—"}</td>
            </tr>`;
          }).join("")}
          </tbody>
        </table></div>
      </div>
      <p class="muted small mt">📡 Sensor sem comunicação gera alerta próprio e nunca é tratado como consumo zero. Leituras guardadas durante quedas de rede são reenviadas ao reconectar. A instalação inicial é feita com apoio técnico.</p>`;

    root.querySelector("#dv-pair").addEventListener("click", () => {
      const m = UI.modal({
        title: "Parear novo sensor",
        body: `
          <div class="pill-steps mb"><span class="kbd">1</span> Código <span>›</span> <span class="kbd">2</span> Associação <span>›</span> <span class="kbd">3</span> Pronto</div>
          <div class="field"><label>Código do sensor (ou leia o QR na etiqueta)</label><input class="input" id="pr-code" value="OHM-S-0${OHM.devices.length + 16}" placeholder="OHM-S-000"></div>
          <div class="field"><label>Nome do equipamento</label><input class="input" id="pr-name" placeholder="ex.: Ar-cond. Split Sala 203"></div>
          <div class="field"><label>Ambiente</label><select class="input" id="pr-amb">${OHM.locations.filter((l) => l.kind === "ambiente" && !l.archived).map((a) => `<option value="${a.id}">${OHM.loc.pathOf(a.id)}</option>`).join("")}</select></div>
          <div class="field"><label>Tipo</label><select class="input" id="pr-type"><option value="ar">Ar-condicionado</option><option value="iluminacao">Iluminação</option><option value="maquina">Máquina</option><option value="tomada">Tomada</option></select></div>
          <label class="checkrow"><input type="checkbox" id="pr-ctrl" checked> Equipamento controlável (sensor com atuador/relé)</label>
          <p class="small muted mt">Sem atuador, o ponto é apenas monitorado e o botão de desligar não aparece na interface.</p>`,
        actions: [
          { label: "Cancelar", onClick: (c) => c() },
          { label: "Parear e associar", kind: "primary", onClick: (c) => {
              const name = m.root.querySelector("#pr-name").value.trim();
              if (!name) { UI.toast("Dê um nome ao equipamento.", "bad"); return; }
              const ctrl = m.root.querySelector("#pr-ctrl").checked;
              const eq = {
                id: "eq" + Date.now(), name, type: m.root.querySelector("#pr-type").value,
                ambienteId: m.root.querySelector("#pr-amb").value, controllable: ctrl, critical: false,
                state: "off", online: true, nominalKw: 1.5, currentKw: 0, profile: "plugs", anomaly: 1,
              };
              OHM.equipments.push(eq);
              OHM.sim.hist[eq.id] = new Float64Array(OHM.sim.DAYS * 24);
              OHM.sim.baseline[eq.id] = new Float64Array(OHM.sim.DAYS * 24);
              OHM.devices.push({ id: m.root.querySelector("#pr-code").value, eqId: eq.id, model: ctrl ? "OHM Sense+Act v2 (medição + atuador)" : "OHM Sense v2 (somente medição)", signal: -54, firmware: "2.4.1", paired: true });
              OHM.sim.log({ userId: UI.user().id, channel: "web", action: "parear_sensor", eqId: eq.id, note: `Sensor associado a ${name}` });
              c(); UI.toast("Sensor pareado — aguardando as primeiras leituras.", "good"); UI.rerender();
            } },
        ],
      });
    });
  };

  /* =========================================================
     TELA 18 — CONFIGURAÇÕES DA ORGANIZAÇÃO
     ========================================================= */
  V.configuracoes = function (root) {
    const c = OHM.config;
    root.innerHTML = `
      ${UI.pageHeader("Configurações da organização", "Mudanças aqui afetam toda a organização e ficam registradas no histórico")}
      <div class="grid cols-2">
        <div class="card">
          <div class="card-title">Tarifa e limites</div>
          <div class="field"><label>Tarifa de energia (R$/kWh) — usada em todas as conversões para reais</label>
            <input class="input" id="cf-tarifa" type="number" step="0.01" value="${c.tarifa}" style="width:140px"></div>
          <div class="row">
            <div class="field"><label>Limite de atenção (% acima do esperado)</label><input class="input" id="cf-lim-a" type="number" value="${c.limiteAtencao}" style="width:110px"></div>
            <div class="field"><label>Limite crítico (%)</label><input class="input" id="cf-lim-c" type="number" value="${c.limiteCritico}" style="width:110px"></div>
          </div>
          <div class="card-title mt">Notificações</div>
          <label class="checkrow"><input type="checkbox" id="cf-ch-app" ${c.canais.app ? "checked" : ""}> Aplicativo (push)</label>
          <label class="checkrow"><input type="checkbox" id="cf-ch-mail" ${c.canais.email ? "checked" : ""}> E-mail</label>
          <div class="field mt"><label>Horário de silêncio (sem notificações não-críticas)</label>
            <div class="row"><input class="input" id="cf-sil-s" type="time" value="${c.silencio.start}" style="width:120px"> <span class="muted">até</span> <input class="input" id="cf-sil-e" type="time" value="${c.silencio.end}" style="width:120px"></div></div>
          <button class="btn primary mt" id="cf-save">💾 Salvar configurações</button>
        </div>
        <div class="card">
          <div class="card-title">Feriados e exceções <span class="hint">regras não executam nestas datas</span></div>
          <div id="cf-feriados">
            ${c.feriados.map((f, i) => `<div class="list-item"><div class="li-ico">📅</div><div class="li-body"><div class="li-title">${f}</div></div><button class="btn sm" data-rm="${i}">remover</button></div>`).join("")}
          </div>
          <div class="row mt"><input class="input" id="cf-new-f" placeholder="ex.: 20/11 — Consciência Negra" style="flex:1"><button class="btn" id="cf-add-f">Adicionar</button></div>
          <hr class="divider">
          <div class="card-title">Organização</div>
          <div class="field"><label>Razão social</label><input class="input" value="${UI.esc(c.orgName)}" disabled></div>
          <p class="small muted">Dados cadastrais são alterados com o suporte OHM (contrato B2B).</p>
        </div>
      </div>`;

    root.querySelector("#cf-save").addEventListener("click", () => {
      c.tarifa = +root.querySelector("#cf-tarifa").value || c.tarifa;
      c.limiteAtencao = +root.querySelector("#cf-lim-a").value || c.limiteAtencao;
      c.limiteCritico = +root.querySelector("#cf-lim-c").value || c.limiteCritico;
      c.canais.app = root.querySelector("#cf-ch-app").checked;
      c.canais.email = root.querySelector("#cf-ch-mail").checked;
      c.silencio.start = root.querySelector("#cf-sil-s").value;
      c.silencio.end = root.querySelector("#cf-sil-e").value;
      OHM.sim.log({ userId: UI.user().id, channel: "web", action: "configurar", eqId: null, note: `Tarifa ${OHM.fmt.brl(c.tarifa)}/kWh · limites ${c.limiteAtencao}%/${c.limiteCritico}%` });
      UI.toast("Configurações salvas e registradas no histórico.", "good");
    });
    root.querySelectorAll("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => { OHM.config.feriados.splice(+b.dataset.rm, 1); UI.rerender(); }));
    root.querySelector("#cf-add-f").addEventListener("click", () => {
      const v = root.querySelector("#cf-new-f").value.trim();
      if (v) { OHM.config.feriados.push(v); UI.rerender(); }
    });
  };

  /* =========================================================
     TELA 19 — HISTÓRICO DE AÇÕES (auditoria)
     ========================================================= */
  V.historico = function (root) {
    const state = V.historico._s || (V.historico._s = { who: "", eq: "", act: "", res: "" });
    let list = OHM.audit.slice();
    if (state.who) list = list.filter((h) => (state.who === "regra" ? !!h.ruleId : h.userId === state.who));
    if (state.eq) list = list.filter((h) => h.eqId === state.eq);
    if (state.act) list = list.filter((h) => h.action === state.act);
    if (state.res) list = list.filter((h) => h.result === state.res);
    const actions = [...new Set(OHM.audit.map((h) => h.action))];

    root.innerHTML = `
      ${UI.pageHeader("Histórico de ações", "Registro de auditoria: quem fez o quê, quando e por qual canal — inclusive comandos que falharam")}
      <div class="filterbar">
        <select class="input" id="h-who"><option value="">Qualquer pessoa</option>${OHM.users.map((u) => `<option value="${u.id}" ${state.who === u.id ? "selected" : ""}>${u.name}</option>`).join("")}<option value="regra" ${state.who === "regra" ? "selected" : ""}>Regras automáticas</option></select>
        <select class="input" id="h-eq"><option value="">Qualquer equipamento</option>${OHM.equipments.map((e) => `<option value="${e.id}" ${state.eq === e.id ? "selected" : ""}>${e.name}</option>`).join("")}</select>
        <select class="input" id="h-act"><option value="">Qualquer ação</option>${actions.map((a) => `<option value="${a}" ${state.act === a ? "selected" : ""}>${a.replace(/_/g, " ")}</option>`).join("")}</select>
        <select class="input" id="h-res"><option value="">Qualquer resultado</option><option value="ok" ${state.res === "ok" ? "selected" : ""}>Sucesso</option><option value="falhou" ${state.res === "falhou" ? "selected" : ""}>Falhou</option></select>
      </div>
      <div class="card">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Quando</th><th>Quem</th><th>Canal</th><th>Ação</th><th>Equipamento</th><th>Resultado</th><th>Observação</th></tr></thead>
          <tbody>
          ${list.map((h) => {
            const who = h.ruleId ? `🤖 Regra “${UI.esc((OHM.rule.byId(h.ruleId) || {}).name || "automática")}”` : (OHM.user.byId(h.userId) || {}).name || "Sistema";
            const eq = h.eqId ? OHM.eq.byId(h.eqId) : null;
            return `<tr>
              <td class="small" style="white-space:nowrap">${OHM.fmt.dt(h.ts)}</td>
              <td><b>${who}</b></td>
              <td><span class="badge ${h.channel === "regra" ? "ctrl" : "neutro"}">${h.channel}</span></td>
              <td class="small">${h.action.replace(/_/g, " ")}</td>
              <td class="small">${eq ? `<a href="#/equipamentos/${eq.id}">${eq.name}</a>` : "—"}</td>
              <td>${h.result === "ok" ? '<span class="result-chip ok">✓ ok</span>' : '<span class="result-chip fail">✕ falhou</span>'}</td>
              <td class="small muted">${h.note ? UI.esc(h.note) : ""}</td>
            </tr>`;
          }).join("")}
          </tbody>
        </table></div>
        ${!list.length ? '<div class="empty">Nada encontrado com esses filtros.</div>' : ""}
      </div>
      <p class="muted small mt">🔒 Estes registros contêm dados pessoais e seguem a LGPD: o acesso é restrito a administradores e protege tanto a organização quanto o usuário. Responde, por exemplo: “quem desligou a máquina da Linha 2 às 14h?”</p>`;

    [["#h-who", "who"], ["#h-eq", "eq"], ["#h-act", "act"], ["#h-res", "res"]].forEach(([sel, k]) =>
      root.querySelector(sel).addEventListener("change", (e) => { state[k] = e.target.value; UI.rerender(); }));
  };

  /* =========================================================
     TELA 20 — PERFIL E PREFERÊNCIAS
     ========================================================= */
  V.perfil = function (root) {
    const user = UI.user();
    const prefs = user.prefs || (user.prefs = { critico: true, atencao: true, offline: true, chApp: true, chMail: user.role === "admin" });
    root.innerHTML = `
      ${UI.pageHeader("Perfil e preferências", user.email)}
      <div class="grid cols-2">
        <div>
          <div class="card mb">
            <div class="row"><span class="avatar" style="width:46px;height:46px;font-size:17px">${user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
              <div><h2>${user.name}</h2><div class="small muted">${user.title} · ${user.role === "admin" ? "Administrador" : "Usuário padrão"}</div></div>
            </div>
            <hr class="divider">
            <button class="btn" id="pf-pass">🔑 Trocar senha</button>
            <button class="btn" id="pf-theme">${document.documentElement.dataset.theme === "dark" ? "☀️ Tema claro" : "🌙 Tema escuro"}</button>
            <button class="btn danger" id="pf-out">Sair da conta</button>
          </div>
          <div class="card">
            <div class="card-title">Quais alertas quero receber</div>
            <label class="checkrow"><input type="checkbox" id="pf-a-crit" ${prefs.critico ? "checked" : ""}> Críticos (sempre recomendado)</label>
            <label class="checkrow"><input type="checkbox" id="pf-a-aten" ${prefs.atencao ? "checked" : ""}> Atenção</label>
            <label class="checkrow"><input type="checkbox" id="pf-a-off" ${prefs.offline ? "checked" : ""}> Sensor offline</label>
            <div class="card-title mt">Por qual canal</div>
            <label class="checkrow"><input type="checkbox" id="pf-c-app" ${prefs.chApp ? "checked" : ""}> Aplicativo (push)</label>
            <label class="checkrow"><input type="checkbox" id="pf-c-mail" ${prefs.chMail ? "checked" : ""}> E-mail</label>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Meu escopo de acesso</div>
          ${user.role === "admin"
            ? `<p class="small">Como <b>administrador</b>, você enxerga toda a organização, cadastra locais, equipamentos e pessoas, define regras e recebe os relatórios.</p>`
            : `<p class="small mb">O administrador liberou para você:</p>` +
              user.scopes.map((s) => `
                <div class="list-item"><div class="li-ico">📍</div>
                  <div class="li-body"><div class="li-title">${OHM.loc.pathOf(s.nodeId)}</div>
                  <div class="li-sub">${[s.view ? "ver consumo e alertas" : "", s.control ? "ligar e desligar equipamentos" : ""].filter(Boolean).join(" · ")}</div></div>
                </div>`).join("") +
              `<p class="small muted mt">Precisa de acesso a outro ambiente? Peça ao administrador — regras e cadastros são exclusivos dele.</p>`}
        </div>
      </div>`;

    root.querySelector("#pf-out").addEventListener("click", () => { UI.setUser(null); UI.go("#/login"); });
    root.querySelector("#pf-theme").addEventListener("click", () => { UI.toggleTheme(); UI.rerender(); });
    root.querySelector("#pf-pass").addEventListener("click", () =>
      UI.modal({
        title: "Trocar senha",
        body: `<div class="field"><label>Senha atual</label><input class="input" type="password"></div>
               <div class="field"><label>Nova senha</label><input class="input" type="password"></div>`,
        actions: [
          { label: "Cancelar", onClick: (c) => c() },
          { label: "Salvar", kind: "primary", onClick: (c) => { c(); UI.toast("Senha alterada (simulado).", "good"); } },
        ],
      }));
    [["#pf-a-crit", "critico"], ["#pf-a-aten", "atencao"], ["#pf-a-off", "offline"], ["#pf-c-app", "chApp"], ["#pf-c-mail", "chMail"]].forEach(([sel, k]) =>
      root.querySelector(sel).addEventListener("change", (e) => { prefs[k] = e.target.checked; UI.toast("Preferências salvas.", "good"); }));
  };
})();
