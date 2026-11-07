/* ============================================================
   OHM — charts.js
   Gráficos SVG sem dependências: linha (com faixa esperada),
   barras, mapa de calor e sparkline. Todos com camada de hover.
   ============================================================ */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      if (m * p >= v) return m * p;
    }
    return 10 * p;
  }

  function makeTip(box) {
    let tip = box.querySelector(".chart-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tip";
      box.appendChild(tip);
    }
    return tip;
  }

  /* ---------------------------------------------------------
     Gráfico de linha.
     opts: { series: [{points:[num], label, color}],
             band: {lo:[num], hi:[num], label} (opcional),
             labels: [string] (eixo x, mesmo tamanho dos points),
             unit, height, fill (bool), yMax }
     --------------------------------------------------------- */
  function lineChart(container, opts) {
    container.classList.add("chart-box");
    container.innerHTML = "";
    const W = 720, H = opts.height || 220;
    const padL = 42, padR = 10, padT = 12, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const n = opts.series[0].points.length;

    let max = opts.yMax || 0;
    if (!max) {
      for (const s of opts.series) for (const v of s.points) max = Math.max(max, v);
      if (opts.band) for (const v of opts.band.hi) max = Math.max(max, v);
      max = niceMax(max * 1.08);
    }
    const x = (i) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => padT + ih - (v / max) * ih;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    // grade
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const v = (max / ticks) * t;
      const yy = y(v);
      svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: yy, y2: yy, stroke: cssVar("--grid"), "stroke-width": 1 }));
      const lbl = el("text", { x: padL - 7, y: yy + 3.5, "text-anchor": "end", "font-size": 10, fill: cssVar("--muted") });
      lbl.textContent = OHM.fmt.compact(v);
      svg.appendChild(lbl);
    }
    // rótulos x (esparsos)
    if (opts.labels) {
      const step = Math.max(1, Math.ceil(n / 8));
      for (let i = 0; i < n; i += step) {
        const lbl = el("text", { x: x(i), y: H - 6, "text-anchor": "middle", "font-size": 10, fill: cssVar("--muted") });
        lbl.textContent = opts.labels[i];
        svg.appendChild(lbl);
      }
    }

    // faixa esperada (banda)
    if (opts.band) {
      let d = "M" + opts.band.hi.map((v, i) => `${x(i)},${y(v)}`).join(" L");
      for (let i = n - 1; i >= 0; i--) d += ` L${x(i)},${y(opts.band.lo[i])}`;
      d += " Z";
      svg.appendChild(el("path", { d, fill: cssVar("--seq-100"), opacity: 0.55 }));
      svg.appendChild(el("path", {
        d: "M" + opts.band.hi.map((v, i) => `${x(i)},${y(v)}`).join(" L"),
        fill: "none", stroke: cssVar("--seq-250"), "stroke-width": 1, "stroke-dasharray": "4 4"
      }));
    }

    // séries
    opts.series.forEach((s, si) => {
      const color = s.color || cssVar("--s" + (si + 1));
      const dLine = "M" + s.points.map((v, i) => `${x(i)},${y(v)}`).join(" L");
      if (opts.fill && si === 0) {
        const dA = dLine + ` L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
        svg.appendChild(el("path", { d: dA, fill: color, opacity: 0.09 }));
      }
      svg.appendChild(el("path", { d: dLine, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    });

    // camada de hover: crosshair + tooltip
    const cross = el("line", { y1: padT, y2: padT + ih, stroke: cssVar("--axis"), "stroke-width": 1, opacity: 0 });
    svg.appendChild(cross);
    const dots = opts.series.map((s, si) => {
      const c = el("circle", { r: 4, fill: s.color || cssVar("--s" + (si + 1)), stroke: cssVar("--surface"), "stroke-width": 2, opacity: 0 });
      svg.appendChild(c);
      return c;
    });
    const overlay = el("rect", { x: padL, y: padT, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(overlay);
    container.appendChild(svg);
    const tip = makeTip(container);

    function onMove(ev) {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      let i = Math.round(((px - padL) / iw) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      const xx = x(i);
      cross.setAttribute("x1", xx); cross.setAttribute("x2", xx);
      cross.setAttribute("opacity", 1);
      let html = opts.labels ? `<div class="t-label">${opts.labels[i]}</div>` : "";
      opts.series.forEach((s, si) => {
        dots[si].setAttribute("cx", xx);
        dots[si].setAttribute("cy", y(s.points[i]));
        dots[si].setAttribute("opacity", 1);
        html += `<div>${s.label ? s.label + ": " : ""}<b>${OHM.fmt.val(s.points[i], opts.unit)}</b></div>`;
      });
      if (opts.band) html += `<div class="t-label">esperado: ${OHM.fmt.val(opts.band.lo[i], opts.unit)} – ${OHM.fmt.val(opts.band.hi[i], opts.unit)}</div>`;
      tip.innerHTML = html;
      tip.style.left = (xx / W) * 100 + "%";
      tip.style.top = (padT / H) * 100 + "%";
      tip.classList.add("show");
    }
    function onLeave() {
      cross.setAttribute("opacity", 0);
      dots.forEach((d) => d.setAttribute("opacity", 0));
      tip.classList.remove("show");
    }
    overlay.addEventListener("mousemove", onMove);
    overlay.addEventListener("mouseleave", onLeave);

    // legenda (apenas 2+ séries ou banda presente)
    if (opts.series.length > 1 || opts.band) {
      const lg = document.createElement("div");
      lg.className = "legend";
      opts.series.forEach((s, si) => {
        lg.innerHTML += `<span class="l-item"><span class="l-line" style="background:${s.color || cssVar("--s" + (si + 1))}"></span>${s.label || "Série " + (si + 1)}</span>`;
      });
      if (opts.band) lg.innerHTML += `<span class="l-item"><span class="l-swatch" style="background:${cssVar("--seq-100")}"></span>${opts.band.label || "Faixa esperada"}</span>`;
      container.appendChild(lg);
    }
  }

  /* ---------------------------------------------------------
     Barras horizontais.
     opts: { items: [{label, value, color, sub}], unit, maxBars }
     --------------------------------------------------------- */
  function barChart(container, opts) {
    container.classList.add("chart-box");
    container.innerHTML = "";
    const items = opts.items.slice(0, opts.maxBars || 12);
    const max = niceMax(Math.max(...items.map((i) => i.value), 0.0001));
    const rowH = 34, labelW = 150, W = 720;
    const H = items.length * rowH + 6;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` });
    const iw = W - labelW - 86;

    items.forEach((it, idx) => {
      const yy = idx * rowH + 6;
      const w = Math.max(3, (it.value / max) * iw);
      const lbl = el("text", { x: labelW - 10, y: yy + 15, "text-anchor": "end", "font-size": 12, fill: cssVar("--ink-2") });
      lbl.textContent = it.label.length > 20 ? it.label.slice(0, 19) + "…" : it.label;
      svg.appendChild(lbl);
      const bar = el("rect", { x: labelW, y: yy, width: w, height: 20, rx: 4, fill: it.color || cssVar("--s1") });
      bar.style.cursor = "default";
      svg.appendChild(bar);
      const val = el("text", { x: labelW + w + 8, y: yy + 15, "font-size": 12, "font-weight": 650, fill: cssVar("--ink") });
      val.textContent = OHM.fmt.val(it.value, opts.unit);
      svg.appendChild(val);

      bar.addEventListener("mousemove", (ev) => {
        const r = svg.getBoundingClientRect();
        tip.innerHTML = `<div class="t-label">${it.label}${it.sub ? " · " + it.sub : ""}</div><b>${OHM.fmt.val(it.value, opts.unit)}</b>`;
        tip.style.left = (((ev.clientX - r.left) / r.width) * 100) + "%";
        tip.style.top = ((yy / H) * 100) + "%";
        tip.classList.add("show");
      });
      bar.addEventListener("mouseleave", () => tip.classList.remove("show"));
    });
    container.appendChild(svg);
    const tip = makeTip(container);
  }

  /* ---------------------------------------------------------
     Mapa de calor hora × dia  (7 linhas × 24 colunas)
     opts: { matrix: [7][24], idleMask: [7][24] (bool, opcional),
             unit, showIdle }
     --------------------------------------------------------- */
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function heatmap(container, opts) {
    container.classList.add("chart-box");
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "heatmap";
    wrap.style.gridTemplateColumns = "34px repeat(24, 1fr)";
    let max = 0;
    for (const row of opts.matrix) for (const v of row) max = Math.max(max, v);
    if (max === 0) max = 1;

    // cabeçalho de horas
    wrap.appendChild(Object.assign(document.createElement("div"), { className: "hm-label" }));
    for (let h = 0; h < 24; h++) {
      const c = document.createElement("div");
      c.className = "hm-label";
      c.style.justifyContent = "center";
      c.textContent = h % 4 === 0 ? h + "h" : "";
      wrap.appendChild(c);
    }
    const steps = ["--seq-100", "--seq-250", "--seq-400", "--seq-550", "--seq-700"];
    for (let d = 0; d < 7; d++) {
      const lab = document.createElement("div");
      lab.className = "hm-label";
      lab.textContent = DOW[d];
      wrap.appendChild(lab);
      for (let h = 0; h < 24; h++) {
        const v = opts.matrix[d][h];
        const cell = document.createElement("div");
        cell.className = "hm-cell";
        if (v <= 0.001) {
          cell.style.background = cssVar("--surface-2");
        } else {
          const idx = Math.min(steps.length - 1, Math.floor((v / max) * steps.length));
          cell.style.background = cssVar(steps[idx]);
        }
        if (opts.showIdle && opts.idleMask && opts.idleMask[d][h] && v > 0.05 * max) cell.classList.add("idle-flag");
        cell.addEventListener("mousemove", (ev) => {
          const r = wrap.getBoundingClientRect();
          tip.innerHTML = `<div class="t-label">${DOW[d]} · ${h}h–${h + 1}h${opts.idleMask && opts.idleMask[d][h] ? " · fora do expediente" : ""}</div><b>${OHM.fmt.val(v, opts.unit)}</b>`;
          tip.style.left = (((ev.clientX - r.left) / r.width) * 100) + "%";
          tip.style.top = (((ev.clientY - r.top) / r.height) * 100) + "%";
          tip.classList.add("show");
        });
        cell.addEventListener("mouseleave", () => tip.classList.remove("show"));
        wrap.appendChild(cell);
      }
    }
    container.appendChild(wrap);
    const tip = makeTip(container);
    const lg = document.createElement("div");
    lg.className = "legend";
    lg.innerHTML = `<span class="l-item muted">menos</span>` +
      steps.map((s) => `<span class="l-swatch" style="background:${cssVar(s)};width:14px"></span>`).join("") +
      `<span class="l-item muted">mais</span>` +
      (opts.showIdle ? `<span class="l-item"><span class="l-swatch" style="background:transparent;outline:2px solid ${cssVar("--s2")};outline-offset:-2px"></span>consumo ocioso</span>` : "");
    container.appendChild(lg);
  }

  /* sparkline simples (sem hover) */
  function sparkline(container, points, color, height) {
    container.innerHTML = "";
    const W = 120, H = height || 32;
    const max = Math.max(...points, 0.0001);
    const x = (i) => (i / (points.length - 1)) * W;
    const y = (v) => H - 3 - (v / max) * (H - 6);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    svg.appendChild(el("path", {
      d: "M" + points.map((v, i) => `${x(i)},${y(v)}`).join(" L"),
      fill: "none", stroke: color || cssVar("--s1"), "stroke-width": 1.8, "stroke-linecap": "round"
    }));
    container.appendChild(svg);
  }

  window.OHMCharts = { lineChart, barChart, heatmap, sparkline };
})();
