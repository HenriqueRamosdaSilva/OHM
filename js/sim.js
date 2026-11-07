/* ============================================================
   OHM — sim.js
   Simulação: histórico de 28 dias (horário), linha de base por
   equipamento, leituras em tempo real, ciclo de vida de comandos
   e motor de regras. Determinístico (RNG com semente) para que o
   protótipo conte sempre a mesma história.
   ============================================================ */
(function () {
  "use strict";

  const H = 3600 * 1000, D = 24 * H;
  const DAYS = 28;

  /* ---------- RNG com semente ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---------- curvas de uso (fração 0..1 da potência nominal) ---------- */
  function profileFactor(profile, dow, hour, seedRnd) {
    const wk = dow >= 1 && dow <= 5;
    const sat = dow === 6;
    switch (profile) {
      case "office_ac":
        if (!wk) return 0;
        if (hour >= 8 && hour < 19) return 0.6 + 0.3 * Math.exp(-Math.pow(hour - 14.5, 2) / 14);
        return 0;
      case "meeting_ac":
        if (!wk || hour < 9 || hour >= 18) return 0;
        return seedRnd() < 0.35 ? 0.8 : 0; // reuniões esporádicas
      case "office_light":
        if (!wk) return 0;
        if (hour >= 7 && hour < 19) return 0.85;
        if (hour === 19) return 0.3;
        return 0;
      case "corridor_light":
        if (!wk) return hour >= 18 && hour < 23 ? 0.2 : 0;
        if (hour >= 7 && hour < 22) return 0.8; // fica ligada até tarde (gera o alerta)
        return 0;
      case "plugs":
        if (wk && hour >= 8 && hour < 19) return 0.5;
        return 0.08; // standby permanente
      case "lab_bench":
        if (wk && hour >= 7 && hour < 19) return 0.6;
        return 0.05;
      case "industrial":
        if (dow === 0) return 0.03;
        if ((wk || sat) && hour >= 6 && hour < 22) return hour === 12 ? 0.5 : 0.85;
        return 0.04;
      case "prod_light":
        if (dow === 0) return 0;
        if ((wk || sat) && hour >= 5 && hour < 22) return 0.85;
        return 0;
      default:
        return 0;
    }
  }

  /* fator de anomalia aplicado ao consumo REAL (não à linha de base) */
  function anomalyFactor(eq, ts) {
    const ageDays = (histEnd - ts) / D;
    if (eq.id === "eq07" && ageDays <= 3) return 1.35;          // alerta crítico ativo
    if (eq.id === "eq12") {
      if (ageDays <= 14 && ageDays > 6) return 1.22;            // desvio resolvido pela manutenção
      if (ageDays <= 6) return 1.04;                            // voltou perto do normal
    }
    if (eq.id === "eq01") return 1.18;                          // aparelho antigo (candidato à troca)
    return 1;
  }

  /* ---------- geração do histórico ---------- */
  const histEnd = (function () { const d = new Date(); d.setMinutes(0, 0, 0); return d.getTime(); })();
  const histStart = histEnd - DAYS * D;
  const hist = {};        // eqId -> Float64Array (kWh por hora)
  const baseline = {};    // eqId -> Float64Array (kWh esperado por hora)

  function buildHistory() {
    for (const eq of OHM.equipments) {
      const n = DAYS * 24;
      const real = new Float64Array(n);
      const base = new Float64Array(n);
      const rnd = mulberry32(hash(eq.id));
      for (let i = 0; i < n; i++) {
        const ts = histStart + i * H;
        const d = new Date(ts);
        const f = profileFactor(eq.profile, d.getDay(), d.getHours(), rnd);
        const weather = eq.type === "ar" ? 1 + 0.12 * Math.sin((ts / D) * 1.1) : 1;
        const expected = eq.nominalKw * f * weather;
        base[i] = expected;
        real[i] = expected * anomalyFactor(eq, ts) * (0.92 + 0.16 * rnd());
      }
      hist[eq.id] = real;
      baseline[eq.id] = base;
    }
  }
  buildHistory();

  function idxOf(ts) { return Math.floor((ts - histStart) / H); }

  /* soma de kWh de um conjunto de equipamentos num intervalo */
  function sumRange(eqIds, from, to, useBaseline) {
    const src = useBaseline ? baseline : hist;
    let total = 0;
    const i0 = Math.max(0, idxOf(from)), i1 = Math.min(DAYS * 24 - 1, idxOf(to));
    for (const id of eqIds) {
      const arr = src[id];
      if (!arr) continue;
      for (let i = i0; i <= i1; i++) total += arr[i];
    }
    return total;
  }

  /* série horária (kWh/h ≈ kW médio) para gráficos */
  function series(eqIds, from, to, stepH, useBaseline) {
    const src = useBaseline ? baseline : hist;
    const pts = [], labels = [];
    const step = (stepH || 1) * H;
    for (let t = from; t < to; t += step) {
      let v = 0;
      const i0 = Math.max(0, idxOf(t)), i1 = Math.min(DAYS * 24 - 1, idxOf(t + step) - 1);
      for (const id of eqIds) {
        const arr = src[id];
        if (!arr) continue;
        for (let i = i0; i <= i1; i++) v += arr[i];
      }
      pts.push(v);
      const d = new Date(t);
      labels.push(stepH >= 24 ? OHM.fmt.d(t) : String(d.getHours()).padStart(2, "0") + "h");
    }
    return { pts, labels };
  }

  /* matriz 7×24 (média de kWh) p/ mapa de calor + máscara de ocioso */
  function heatmapMatrix(eqIds, ambIds) {
    const m = Array.from({ length: 7 }, () => new Float64Array(24));
    const cnt = Array.from({ length: 7 }, () => new Float64Array(24));
    for (const id of eqIds) {
      const arr = hist[id];
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const d = new Date(histStart + i * H);
        m[d.getDay()][d.getHours()] += arr[i];
        cnt[d.getDay()][d.getHours()] += 1;
      }
    }
    // média por semana: cada slot (dia, hora) ocorre ~4 vezes em 28 dias
    const out = m.map((row, dw) => Array.from(row, (v, h) => {
      const occ = eqIds.length ? cnt[dw][h] / eqIds.length : 0;
      return occ ? v / occ : 0;
    }));
    // máscara de horário esperado (qualquer ambiente do conjunto em funcionamento)
    const idle = Array.from({ length: 7 }, () => Array(24).fill(true));
    const ambs = (ambIds || []).map((id) => OHM.loc.byId(id)).filter(Boolean);
    for (let dw = 0; dw < 7; dw++) for (let h = 0; h < 24; h++) {
      let open = false;
      for (const a of ambs) {
        const hr = a.hours || { start: 8, end: 19, days: [1, 2, 3, 4, 5] };
        if (hr.days.includes(dw) && h >= hr.start && h < hr.end) { open = true; break; }
      }
      idle[dw][h] = !open;
    }
    return { matrix: out, idleMask: idle };
  }

  /* consumo ocioso (fora do horário) num intervalo */
  function idleShare(eqIds, from, to) {
    let total = 0, idle = 0;
    const i0 = Math.max(0, idxOf(from)), i1 = Math.min(DAYS * 24 - 1, idxOf(to));
    for (const id of eqIds) {
      const eq = OHM.eq.byId(id);
      const amb = OHM.loc.byId(eq.ambienteId);
      const hr = (amb && amb.hours) || { start: 8, end: 19, days: [1, 2, 3, 4, 5] };
      const arr = hist[id];
      for (let i = i0; i <= i1; i++) {
        const d = new Date(histStart + i * H);
        const open = hr.days.includes(d.getDay()) && d.getHours() >= hr.start && d.getHours() < hr.end;
        total += arr[i];
        if (!open) idle += arr[i];
      }
    }
    return { total, idle };
  }

  /* ---------- tempo real ---------- */
  const jitterRnd = mulberry32(42);
  let liveListeners = [];
  function onTick(fn) { liveListeners.push(fn); }
  function clearTicks() { liveListeners = []; }

  setInterval(() => {
    for (const eq of OHM.equipments) {
      if (eq.state === "on" && eq.online) {
        const base = eq._baseKw || (eq._baseKw = eq.currentKw);
        eq.currentKw = Math.max(0.05, base * (0.97 + 0.06 * jitterRnd()));
      }
    }
    for (const fn of liveListeners) { try { fn(); } catch (e) { /* view desmontada */ } }
  }, 4000);

  function currentTotalKw(user) {
    let t = 0, offline = 0;
    for (const eq of OHM.perm.visibleEquipments(user)) {
      if (!eq.online) { offline++; if (eq.state === "on") t += eq.currentKw; continue; }
      if (eq.state === "on" || eq.state === "standby") t += eq.currentKw;
    }
    return { totalKw: t, offlineCount: offline };
  }

  /* ---------- auditoria ---------- */
  let auditSeq = 100;
  function log(entry) {
    OHM.audit.unshift(Object.assign({ id: "h" + auditSeq++, ts: Date.now(), result: "ok" }, entry));
  }

  /* ---------- comandos (enviado → confirmado | falhou) ----------
     Nunca mostramos "desligado" só porque o botão foi tocado:
     o estado muda apenas quando o "sensor" confirma.             */
  function sendCommand(eq, desired, ctx) {
    return new Promise((resolve) => {
      const delay = 1100 + Math.random() * 900;
      setTimeout(() => {
        if (!eq.online) {
          log({ userId: ctx.userId || null, ruleId: ctx.ruleId || null, channel: ctx.channel, action: desired === "off" ? "desligar" : "ligar", eqId: eq.id, result: "falhou", note: "Dispositivo offline — comando não confirmado" });
          resolve({ ok: false, reason: "Equipamento offline — o comando não foi confirmado." });
          return;
        }
        eq.state = desired === "off" ? "off" : "on";
        eq._baseKw = desired === "off" ? 0 : eq.nominalKw * 0.8;
        eq.currentKw = eq._baseKw;
        log({ userId: ctx.userId || null, ruleId: ctx.ruleId || null, channel: ctx.channel, action: desired === "off" ? "desligar" : "ligar", eqId: eq.id, result: "ok", note: ctx.note });
        resolve({ ok: true });
      }, delay);
    });
  }

  /* desligamento em lote com resultado por item */
  async function bulkShutdown(eqs, ctx, onItem) {
    const results = [];
    await Promise.all(eqs.map(async (eq) => {
      onItem && onItem(eq.id, { status: "sending" });
      const r = await sendCommand(eq, "off", ctx);
      results.push({ eqId: eq.id, ok: r.ok, reason: r.reason });
      onItem && onItem(eq.id, { status: r.ok ? "ok" : "fail", reason: r.reason });
    }));
    const okCount = results.filter((r) => r.ok).length;
    log({ userId: ctx.userId, channel: ctx.channel, action: "encerrar_expediente", eqId: null, result: okCount === results.length ? "ok" : "falhou", note: `${eqs.length} equipamentos — ${okCount} confirmados, ${results.length - okCount} falharam` });
    return results;
  }

  /* ---------- motor de regras (demonstração do fluxo 4) ----------
     Simula: alguém religa um ar após as 19h → a regra detecta,
     desliga de novo, registra no histórico e avisa o responsável. */
  async function demoRuleEvent(rule, onStep) {
    const eq = OHM.eq.byId(rule.eqIds.find((id) => OHM.eq.byId(id).online) || rule.eqIds[0]);
    onStep("religado", `22h04 — ${eq.name} foi religado manualmente (fora do horário permitido).`);
    eq.state = "on"; eq._baseKw = eq.nominalKw * 0.8; eq.currentKw = eq._baseKw;
    log({ userId: null, channel: "app", action: "ligar", eqId: eq.id, result: "ok", note: "Religamento manual fora do horário (simulado)" });
    await wait(1600);
    onStep("detectado", `A regra “${rule.name}” detectou o religamento após ${rule.trigger.after || "19:00"}.`);
    await wait(1400);
    if (rule.actions.includes("desligar")) {
      onStep("comando", "Enviando comando de desligamento…");
      const r = await sendCommand(eq, "off", { ruleId: rule.id, channel: "regra", note: "Religado fora do horário — desligado pela regra" });
      onStep(r.ok ? "desligado" : "falhou", r.ok ? `${eq.name} desligado e confirmado pelo sensor.` : r.reason);
    }
    if (rule.actions.includes("alertar")) {
      await wait(600);
      OHM.alerts.unshift({
        id: "a" + Date.now(), type: "fora_horario", severity: "atencao", state: "novo",
        eqId: eq.id, since: Date.now(), deviationPct: null, extraCostPerDay: 2.1,
        title: "Religamento fora do horário (ação automática)",
        detail: `${eq.name} foi religado após as ${rule.trigger.after || "19:00"} e desligado pela regra “${rule.name}”. O responsável pelo setor foi notificado.`,
        causes: ["Uso fora do expediente", "Desconhecimento da política de horários"], silenced: false,
      });
      onStep("alertado", "Aviso enviado ao responsável do setor (app + e-mail).");
    }
    rule.execCount++;
    rule.lastRun = Date.now();
    onStep("fim", "Fluxo concluído — tudo registrado no Histórico de ações.");
  }
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /* ---------- projeção e oportunidades ---------- */
  function projection(eqIds) {
    const nowTs = Date.now();
    const d = new Date(); const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const dayOfMonth = d.getDate();
    const mtd = sumRange(eqIds, Math.max(monthStart, histStart), nowTs);
    const covered = Math.min(dayOfMonth, DAYS); // dias com histórico
    const pace = mtd / Math.max(1, Math.min(dayOfMonth, covered));
    const projected = pace * daysInMonth;
    return { mtd, projected, costMtd: mtd * OHM.config.tarifa, costProjected: projected * OHM.config.tarifa, daysInMonth, dayOfMonth };
  }

  function opportunities() {
    const t = OHM.config.tarifa;
    return [
      { id: "o1", title: "Ar-condicionado ligado após o expediente — Bloco B", desc: "Um split de 12.000 BTU/h ligado 10h além do expediente, em 22 dias úteis, consome ≈ 220 kWh.", kwhMonth: 220, valueMonth: 220 * t, action: "Ativar a regra de religamento fora do horário para todo o Bloco B", link: "#/automacoes" },
      { id: "o2", title: "Desvio do ar-condicionado do Laboratório 2", desc: "Consumo 35% acima do esperado há 3 dias. Manutenção (filtros/gás) elimina o custo extra.", kwhMonth: 180, valueMonth: 180 * t, action: "Executar a recomendação de manutenção aberta", link: "#/saude" },
      { id: "o3", title: "Consumo em standby fora do expediente — Bloco A", desc: "Tomadas e réguas mantêm ≈ 0,5 kW nas madrugadas e fins de semana.", kwhMonth: 72, valueMonth: 72 * t, action: "Criar regra de desligamento de réguas às 20h", link: "#/automacoes/nova" },
      { id: "o4", title: "Substituição do ar-condicionado da Recepção (2016)", desc: "Aparelho consome ≈ 18% a mais que um inverter novo equivalente. Custo extra ≈ R$ 310/mês contra R$ 2.400 do aparelho novo — retorno em ≈ 8 meses.", kwhMonth: 260, valueMonth: 310, action: "Avaliar troca na tela Saúde e manutenção", link: "#/saude" },
    ];
  }

  /* saúde por equipamento (evolução do desvio em semanas) */
  function healthOf(eq) {
    const a = OHM.alerts.find((x) => x.eqId === eq.id && x.type === "desvio" && x.state !== "resolvido");
    if (a && a.severity === "critico") return "critico";
    if (a || eq.id === "eq12" || eq.id === "eq01") return "atencao";
    return "normal";
  }

  OHM.sim = {
    DAYS, histStart, histEnd, hist, baseline,
    sumRange, series, heatmapMatrix, idleShare,
    onTick, clearTicks, currentTotalKw,
    sendCommand, bulkShutdown, demoRuleEvent, log,
    projection, opportunities, healthOf,
  };
})();
