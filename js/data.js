/* ============================================================
   OHM — data.js
   Modelo de domínio + dados de demonstração.
   Números calibrados com o pitch: 42,8 kW, −18%, desvio de 35%,
   tarifa R$ 1,18/kWh.
   ============================================================ */
(function () {
  "use strict";

  const now = Date.now();
  const H = 3600 * 1000, D = 24 * H;

  /* ---------- formatação pt-BR ---------- */
  const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dtF = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const dF = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

  const fmt = {
    kw: (v) => nf1.format(v) + " kW",
    kwh: (v) => (v >= 100 ? nf0 : nf1).format(v) + " kWh",
    brl: (v) => brl.format(v),
    pct: (v, signed) => (signed && v > 0 ? "+" : "") + nf1.format(v) + "%",
    dt: (ts) => dtF.format(ts),
    d: (ts) => dF.format(ts),
    compact: (v) => (v >= 1000 ? nf1.format(v / 1000) + "k" : nf1.format(v)),
    val: (v, unit) => unit === "R$" ? brl.format(v) : nf1.format(v) + (unit ? " " + unit : ""),
    ago: (ts) => {
      const m = Math.round((Date.now() - ts) / 60000);
      if (m < 1) return "agora";
      if (m < 60) return `há ${m} min`;
      const h = Math.round(m / 60);
      if (h < 24) return `há ${h} h`;
      const d = Math.round(h / 24);
      return d === 1 ? "ontem" : `há ${d} dias`;
    },
  };

  /* ---------- estrutura de locais ---------- */
  // kind: unidade | bloco | setor | ambiente
  // hours: horário de funcionamento esperado (alimenta a detecção de ocioso)
  const OFFICE = { start: 8, end: 19, days: [1, 2, 3, 4, 5] };
  const LAB = { start: 7, end: 19, days: [1, 2, 3, 4, 5] };
  const PROD = { start: 6, end: 22, days: [1, 2, 3, 4, 5, 6] };

  const locations = [
    { id: "matriz", name: "Unidade Matriz", kind: "unidade", parentId: null },
    { id: "bloco-a", name: "Bloco A", kind: "bloco", parentId: "matriz" },
    { id: "bloco-b", name: "Bloco B", kind: "bloco", parentId: "matriz" },
    { id: "galpao", name: "Galpão Industrial", kind: "bloco", parentId: "matriz" },
    { id: "set-admin", name: "Administrativo", kind: "setor", parentId: "bloco-a" },
    { id: "set-lab", name: "Laboratório", kind: "setor", parentId: "bloco-b" },
    { id: "set-prod", name: "Produção", kind: "setor", parentId: "galpao" },
    { id: "amb-recepcao", name: "Recepção", kind: "ambiente", parentId: "set-admin", hours: OFFICE },
    { id: "amb-reunioes", name: "Sala de Reuniões", kind: "ambiente", parentId: "set-admin", hours: OFFICE },
    { id: "amb-escritorio", name: "Escritório Aberto", kind: "ambiente", parentId: "set-admin", hours: OFFICE },
    { id: "amb-copa", name: "Copa", kind: "ambiente", parentId: "set-admin", hours: OFFICE },
    { id: "amb-corredor-a", name: "Corredor / Circulação", kind: "ambiente", parentId: "set-admin", hours: OFFICE },
    { id: "amb-lab1", name: "Laboratório 1", kind: "ambiente", parentId: "set-lab", hours: LAB },
    { id: "amb-lab2", name: "Laboratório 2", kind: "ambiente", parentId: "set-lab", hours: LAB },
    { id: "amb-b101", name: "Sala B-101", kind: "ambiente", parentId: "set-lab", hours: OFFICE },
    { id: "amb-linha1", name: "Linha 1", kind: "ambiente", parentId: "set-prod", hours: PROD },
    { id: "amb-linha2", name: "Linha 2", kind: "ambiente", parentId: "set-prod", hours: PROD },
  ];

  /* ---------- equipamentos ----------
     type: ar | iluminacao | maquina | tomada
     profile: curva de uso usada na simulação (ver sim.js)
     online: comunicação do dispositivo (false = offline p/ leitura E comando)
     anomaly: fator de desvio aplicado nos últimos dias (1 = normal)       */
  const equipments = [
    // ---- Bloco A · Administrativo ----
    { id: "eq01", name: "Ar-cond. Split Recepção", type: "ar", ambienteId: "amb-recepcao", controllable: true, critical: false, state: "on", online: true, nominalKw: 2.6, currentKw: 2.4, profile: "office_ac", anomaly: 1, installYear: 2016, btu: "12.000 BTU/h" },
    { id: "eq02", name: "Ar-cond. Split Sala de Reuniões", type: "ar", ambienteId: "amb-reunioes", controllable: true, critical: false, state: "off", online: true, nominalKw: 2.2, currentKw: 0, profile: "meeting_ac", anomaly: 1, installYear: 2022, btu: "18.000 BTU/h" },
    { id: "eq03", name: "Iluminação Escritório Aberto", type: "iluminacao", ambienteId: "amb-escritorio", controllable: true, critical: false, state: "on", online: true, nominalKw: 1.2, currentKw: 1.1, profile: "office_light", anomaly: 1 },
    { id: "eq04", name: "Iluminação Corredor Bloco A", type: "iluminacao", ambienteId: "amb-corredor-a", controllable: true, critical: false, state: "on", online: true, nominalKw: 0.6, currentKw: 0.5, profile: "corridor_light", anomaly: 1 },
    { id: "eq05", name: "Tomadas Escritório (régua monitorada)", type: "tomada", ambienteId: "amb-escritorio", controllable: false, critical: false, state: "standby", online: true, nominalKw: 0.9, currentKw: 0.4, profile: "plugs", anomaly: 1 },
    { id: "eq06", name: "Tomadas Copa", type: "tomada", ambienteId: "amb-copa", controllable: false, critical: false, state: "on", online: false, nominalKw: 0.6, currentKw: 0.3, profile: "plugs", anomaly: 1, lastSeen: now - 2 * H },
    // ---- Bloco B · Laboratório ----
    { id: "eq07", name: "Ar-cond. Split Laboratório 2", type: "ar", ambienteId: "amb-lab2", controllable: true, critical: false, state: "on", online: true, nominalKw: 1.8, currentKw: 2.3, profile: "office_ac", anomaly: 1.35, anomalySinceDays: 3, installYear: 2021, btu: "12.000 BTU/h" },
    { id: "eq08", name: "Iluminação Laboratório 1", type: "iluminacao", ambienteId: "amb-lab1", controllable: true, critical: false, state: "on", online: true, nominalKw: 0.4, currentKw: 0.3, profile: "office_light", anomaly: 1 },
    { id: "eq09", name: "Bancadas Laboratório 1", type: "tomada", ambienteId: "amb-lab1", controllable: false, critical: false, state: "on", online: true, nominalKw: 0.8, currentKw: 0.5, profile: "lab_bench", anomaly: 1 },
    { id: "eq10", name: "Ar-cond. Split Sala B-101", type: "ar", ambienteId: "amb-b101", controllable: true, critical: false, state: "on", online: false, nominalKw: 2.0, currentKw: 1.9, profile: "office_ac", anomaly: 1, lastSeen: now - 35 * 60000, installYear: 2020, btu: "12.000 BTU/h" },
    // ---- Galpão · Produção ----
    { id: "eq11", name: "Forno Industrial", type: "maquina", ambienteId: "amb-linha1", controllable: true, critical: true, state: "on", online: true, nominalKw: 19.0, currentKw: 17.8, profile: "industrial", anomaly: 1 },
    { id: "eq12", name: "Compressor de Ar", type: "maquina", ambienteId: "amb-linha1", controllable: true, critical: true, state: "on", online: true, nominalKw: 7.5, currentKw: 6.9, profile: "industrial", anomaly: 1.12, anomalySinceDays: 14 },
    { id: "eq13", name: "Máquina de Corte — Linha 2", type: "maquina", ambienteId: "amb-linha2", controllable: true, critical: true, state: "on", online: true, nominalKw: 7.2, currentKw: 6.8, profile: "industrial", anomaly: 1 },
    { id: "eq14", name: "Iluminação Galpão", type: "iluminacao", ambienteId: "amb-linha1", controllable: true, critical: false, state: "on", online: true, nominalKw: 1.5, currentKw: 1.3, profile: "prod_light", anomaly: 1 },
    { id: "eq15", name: "Exaustores Linha 2", type: "maquina", ambienteId: "amb-linha2", controllable: true, critical: false, state: "on", online: true, nominalKw: 0.8, currentKw: 0.6, profile: "industrial", anomaly: 1 },
  ];

  /* ---------- usuários e permissões ----------
     role: admin | user
     scopes: [{nodeId, view, control}]  (admin enxerga tudo)      */
  const users = [
    { id: "u-mariana", name: "Mariana Costa", email: "mariana@empresa.com.br", role: "admin", title: "Coordenadora de Facilities", active: true, lastAccess: now - 20 * 60000, scopes: [] },
    { id: "u-rafael", name: "Rafael Almeida", email: "rafael@empresa.com.br", role: "admin", title: "Gerente de Manutenção", active: true, lastAccess: now - 3 * H, scopes: [] },
    { id: "u-paola", name: "Paola Queiroz", email: "paola@empresa.com.br", role: "user", title: "Supervisora — Bloco B", active: true, lastAccess: now - 50 * 60000, scopes: [{ nodeId: "bloco-b", view: true, control: true }] },
    { id: "u-daniela", name: "Daniela Zei", email: "daniela@empresa.com.br", role: "user", title: "Analista Administrativo", active: true, lastAccess: now - 26 * H, scopes: [{ nodeId: "set-admin", view: true, control: true }] },
    { id: "u-carlos", name: "Carlos Lima", email: "carlos@empresa.com.br", role: "user", title: "Operador (desligado da empresa)", active: false, lastAccess: now - 40 * D, scopes: [{ nodeId: "set-prod", view: true, control: false }] },
  ];

  /* ---------- regras de automação ----------
     trigger: {kind: horario|ociosidade|evento, ...}
     actions: ["desligar","alertar"]                                */
  const rules = [
    {
      id: "r1", name: "Encerrar expediente — Bloco A", active: true,
      scopeNodeId: "bloco-a", eqIds: ["eq01", "eq02", "eq03", "eq04"],
      trigger: { kind: "horario", time: "19:00", days: [1, 2, 3, 4, 5] },
      actions: ["desligar"], exceptions: ["Feriados nacionais"],
      lastRun: now - 15 * H, execCount: 46, estSavingsMonth: 180,
    },
    {
      id: "r2", name: "Religamento fora do horário — ares Bloco B", active: true,
      scopeNodeId: "bloco-b", eqIds: ["eq07", "eq10"],
      trigger: { kind: "evento", event: "religado", after: "19:00", days: [1, 2, 3, 4, 5] },
      actions: ["desligar", "alertar"], exceptions: ["Feriados nacionais", "Eventos cadastrados"],
      lastRun: now - 2 * D, execCount: 12, estSavingsMonth: 260,
    },
    {
      id: "r3", name: "Ociosidade — Sala de Reuniões", active: false,
      scopeNodeId: "amb-reunioes", eqIds: ["eq02"],
      trigger: { kind: "ociosidade", minutes: 30 },
      actions: ["alertar"], exceptions: [],
      lastRun: now - 6 * D, execCount: 8, estSavingsMonth: 45,
    },
  ];

  /* ---------- alertas ----------
     type: desvio | fora_horario | sensor_offline | regra_falhou
     severity: atencao | critico   state: novo | analise | resolvido */
  const alerts = [
    {
      id: "a1", type: "desvio", severity: "critico", state: "novo",
      eqId: "eq07", since: now - 3 * D, deviationPct: 35,
      extraCostPerDay: 7.1, title: "Consumo 35% acima do esperado",
      detail: "O consumo do ar-condicionado do Laboratório 2 está consistentemente acima da linha de base construída com o histórico do próprio equipamento (dia da semana, horário e temperatura externa).",
      causes: ["Filtros sujos ou obstruídos", "Baixa carga de gás refrigerante", "Obsolescência do aparelho / degradação do compressor"],
      silenced: false,
    },
    {
      id: "a2", type: "fora_horario", severity: "atencao", state: "analise",
      eqId: "eq04", since: now - 14 * H, deviationPct: null,
      extraCostPerDay: 1.4, title: "Equipamento ligado fora do horário",
      detail: "A iluminação do corredor do Bloco A permaneceu ligada após as 22h de ontem, fora do horário de funcionamento esperado do ambiente (8h–19h, dias úteis).",
      causes: ["Esquecimento na saída", "Falha no acionamento da regra de encerramento"],
      silenced: false,
    },
    {
      id: "a3", type: "sensor_offline", severity: "atencao", state: "novo",
      eqId: "eq06", since: now - 2 * H, deviationPct: null,
      extraCostPerDay: null, title: "Sensor sem comunicação",
      detail: "O sensor das tomadas da Copa não envia leituras há 2 horas. O consumo deste ponto está sendo exibido como indisponível — não como zero — para não distorcer os totais.",
      causes: ["Queda de Wi-Fi no ambiente", "Sensor desenergizado", "Falha de hardware"],
      silenced: false,
    },
    {
      id: "a4", type: "desvio", severity: "atencao", state: "resolvido",
      eqId: "eq12", since: now - 9 * D, resolvedAt: now - 6 * D, deviationPct: 22,
      extraCostPerDay: 11.2, title: "Consumo 22% acima do esperado",
      detail: "O compressor de ar apresentou desvio crescente ao longo de uma semana. Após inspeção e lubrificação (recomendação nº M2), o consumo retornou à faixa esperada.",
      causes: ["Desgaste de componentes", "Atrito por falta de lubrificação", "Obstrução na linha de ar"],
      silenced: false,
    },
  ];

  /* ---------- recomendações de manutenção ---------- */
  const maints = [
    { id: "m1", eqId: "eq07", alertId: "a1", action: "Limpeza de filtros e verificação de gás refrigerante", status: "aberta", createdAt: now - 2 * D },
    { id: "m2", eqId: "eq12", alertId: "a4", action: "Inspeção de desgaste e lubrificação do compressor", status: "executada", createdAt: now - 8 * D, doneAt: now - 6 * D, result: "Consumo retornou à faixa esperada em 48h — economia de ≈ R$ 11/dia confirmada." },
  ];

  /* ---------- histórico de ações (auditoria) ----------
     channel: app | web | regra    result: ok | falhou              */
  const audit = [
    { id: "h1", ts: now - 25 * 60000, userId: "u-rafael", channel: "web", action: "desligar", eqId: "eq13", result: "ok", note: "Parada programada para troca de ferramenta" },
    { id: "h2", ts: now - 15 * H, userId: null, ruleId: "r1", channel: "regra", action: "desligar", eqId: "eq03", result: "ok" },
    { id: "h3", ts: now - 15 * H, userId: null, ruleId: "r1", channel: "regra", action: "desligar", eqId: "eq01", result: "ok" },
    { id: "h4", ts: now - 15 * H, userId: null, ruleId: "r1", channel: "regra", action: "desligar", eqId: "eq04", result: "falhou", note: "Dispositivo não confirmou o comando" },
    { id: "h5", ts: now - 16 * H, userId: "u-paola", channel: "app", action: "encerrar_expediente", eqId: null, result: "ok", note: "3 equipamentos do Bloco B — 2 confirmados, 1 falhou (offline)" },
    { id: "h6", ts: now - 2 * D, userId: null, ruleId: "r2", channel: "regra", action: "desligar", eqId: "eq07", result: "ok", note: "Religado às 21h47 — desligado pela regra e responsável avisado" },
    { id: "h7", ts: now - 3 * D, userId: "u-mariana", channel: "web", action: "configurar", eqId: null, result: "ok", note: "Tarifa atualizada para R$ 1,18/kWh" },
    { id: "h8", ts: now - 5 * D, userId: "u-mariana", channel: "web", action: "cadastrar_usuario", eqId: null, result: "ok", note: "Convite enviado para daniela@empresa.com.br" },
    { id: "h9", ts: now - 6 * D, userId: "u-rafael", channel: "web", action: "manutencao", eqId: "eq12", result: "ok", note: "Recomendação M2 registrada como executada" },
    { id: "h10", ts: now - 7 * D, userId: "u-daniela", channel: "app", action: "desligar", eqId: "eq01", result: "ok" },
  ];

  /* ---------- configurações da organização ---------- */
  const config = {
    orgName: "Indústria & Escritórios Horizonte Ltda.",
    tarifa: 1.18,            // R$/kWh — usada em todas as conversões
    limiteAtencao: 20,       // % acima do esperado
    limiteCritico: 35,
    canais: { app: true, email: true },
    silencio: { start: "22:00", end: "06:00" },
    feriados: ["12/10 — N. Sra. Aparecida", "02/11 — Finados", "15/11 — Proclamação da República", "25/12 — Natal"],
  };

  /* ---------- sensores / dispositivos ---------- */
  const devices = equipments.map((e, i) => ({
    id: "OHM-S-" + String(i + 1).padStart(3, "0"),
    eqId: e.id,
    model: e.controllable ? "OHM Sense+Act v2 (medição + atuador)" : "OHM Sense v2 (somente medição)",
    signal: e.online ? [-52, -61, -47, -70, -58][i % 5] : null,
    firmware: "2.4.1",
    paired: true,
  }));

  /* ---------- helpers de locais ---------- */
  const locById = {};
  locations.forEach((l) => (locById[l.id] = l));

  function children(id) { return locations.filter((l) => l.parentId === id && !l.archived); }
  function descendants(id) {
    const out = [];
    (function walk(pid) {
      for (const c of children(pid)) { out.push(c); walk(c.id); }
    })(id);
    return out;
  }
  function ambientesUnder(id) {
    const n = locById[id];
    if (!n) return [];
    if (n.kind === "ambiente") return [n];
    return descendants(id).filter((l) => l.kind === "ambiente");
  }
  function pathOf(id) {
    const parts = [];
    let n = locById[id];
    while (n) { parts.unshift(n.name); n = locById[n.parentId]; }
    return parts.join(" › ");
  }
  function blocoOf(ambienteId) {
    let n = locById[ambienteId];
    while (n && n.kind !== "bloco") n = locById[n.parentId];
    return n;
  }

  /* ---------- helpers de permissão (RBAC com escopo) ---------- */
  function visibleAmbientes(user) {
    if (!user) return [];
    if (user.role === "admin") return locations.filter((l) => l.kind === "ambiente");
    const set = new Map();
    for (const s of user.scopes) if (s.view) for (const a of ambientesUnder(s.nodeId)) set.set(a.id, a);
    return [...set.values()];
  }
  function controlAmbientes(user) {
    if (!user) return [];
    if (user.role === "admin") return locations.filter((l) => l.kind === "ambiente");
    const set = new Map();
    for (const s of user.scopes) if (s.control) for (const a of ambientesUnder(s.nodeId)) set.set(a.id, a);
    return [...set.values()];
  }
  function canSeeEq(user, eq) {
    return visibleAmbientes(user).some((a) => a.id === eq.ambienteId);
  }
  function canControlEq(user, eq) {
    if (!eq.controllable) return false;
    return controlAmbientes(user).some((a) => a.id === eq.ambienteId);
  }
  function visibleEquipments(user) {
    const ids = new Set(visibleAmbientes(user).map((a) => a.id));
    return equipments.filter((e) => ids.has(e.ambienteId));
  }

  const eqIcons = { ar: "❄️", iluminacao: "💡", maquina: "⚙️", tomada: "🔌" };
  const eqTypeNames = { ar: "Ar-condicionado", iluminacao: "Iluminação", maquina: "Máquina", tomada: "Tomada" };

  window.OHM = {
    fmt, config, locations, equipments, users, rules, alerts, maints, audit, devices,
    weather: { temp: 27.5, hum: 62 },
    eqIcons, eqTypeNames,
    loc: { byId: (id) => locById[id], children, descendants, ambientesUnder, pathOf, blocoOf },
    eq: { byId: (id) => equipments.find((e) => e.id === id) },
    user: { byId: (id) => users.find((u) => u.id === id) },
    rule: { byId: (id) => rules.find((r) => r.id === id) },
    alert: { byId: (id) => alerts.find((a) => a.id === id) },
    perm: { visibleAmbientes, controlAmbientes, canSeeEq, canControlEq, visibleEquipments },
  };
})();
