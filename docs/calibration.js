/* Display independently hashed computations from the same generation as the weather gate. */
globalThis.FuelCalibration = function ({ $, make, set, fmt, lines, option, svg, feedRoot }) {
  const initial = globalThis.FUEL_CALIBRATION;
  const cache = new Map(
    Object.entries(initial.rows).map(([k, v]) => [initial.report.entries[k], v]),
  );
  const engine = $("cal-engine"),
    fuel = $("cal-fuel"),
    metric = $("cal-metric"),
    time = $("cal-time");
  const series = {
    pulsePct: ["Injector pulse · % of stock", 1],
    offsetDeg: ["Timing offset · °BTDC", 1],
    lw: ["End-gas knock integral", 2],
    delayDeg: ["Ignition lag · crank degrees", 1],
    peakBar: ["Peak cylinder pressure · bar", 1],
    flameSpeedMps: ["Laminar flame speed · m/s", 2],
  };
  let index = null,
    result = null,
    sequence = 0,
    active = [2, 2],
    live = false,
    cursor = null;
  const number = (v, d = 1) => (v === null || v === undefined ? "—" : fmt(v, d));
  function setMetrics() {
    const old = metric.value;
    const keys =
      engine.value === "diesel"
        ? ["pulsePct", "offsetDeg", "delayDeg", "peakBar"]
        : ["pulsePct", "offsetDeg", "lw", "flameSpeedMps", "peakBar"];
    metric.replaceChildren(...keys.map((k) => option(k, series[k][0])));
    metric.value = keys.includes(old) ? old : engine.value === "diesel" ? "delayDeg" : "lw";
  }
  async function bytes(url, hash) {
    const response = await fetch(url + "?h=" + hash, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error();
    const data = await response.arrayBuffer();
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    if (actual !== hash) throw Error();
    return data;
  }
  function point() {
    const m = result.map,
      [i, j] = active,
      c = m.cells[i][j];
    set("cal-point", fmt(m.rpms[i]) + " rpm · " + fmt(m.loads[j] * 100) + "% load");
    if (!c) {
      lines($("cal-point-values"), [["Ignition", "No supported solution"]]);
      return;
    }
    lines($("cal-point-values"), [
      ["Pulse vs stock", number(c.pulsePct) + "% · " + number(c.pulseMs, 2) + " ms"],
      [
        engine.value === "diesel" ? "Injection timing" : "Spark timing",
        number(c.btdc) + " °BTDC · offset " + number(c.offsetDeg) + "°",
      ],
      ["Peak pressure / CA50", number(c.peakBar) + " bar / " + number(c.ca50) + " °ATDC"],
      [
        engine.value === "diesel" ? "Ignition lag" : "End-gas integral",
        engine.value === "diesel" ? number(c.delayDeg) + " °CA" : number(c.lw, 3),
      ],
      [
        "Cell assessment",
        [...c.reasons, ...(c.lspiReview ? ["LSPI test required"] : [])].join(" · ") ||
          "Within modeled bounds",
      ],
    ]);
  }
  function heatmap(focus = false) {
    if (!result?.map.cells.length) return;
    const m = result.map,
      k = metric.value,
      vals = m.cells
        .flat()
        .map((c) => c?.[k])
        .filter(Number.isFinite);
    const min = Math.min(...vals),
      max = Math.max(...vals);
    const head = make("thead"),
      hr = make("tr");
    hr.append(make("th", "", "rpm / load"));
    m.loads.forEach((l) => hr.append(make("th", "", fmt(l * 100) + "%")));
    head.append(hr);
    const body = make("tbody");
    m.cells.forEach((row, i) => {
      const tr = make("tr"),
        th = make("th", "", fmt(m.rpms[i]));
      th.scope = "row";
      tr.append(th);
      row.forEach((c, j) => {
        const td = make("td"),
          v = c?.[k],
          flag = !c || c.reasons.length || c.lspiReview;
        const btn = make("button", "cal-cell", number(v, series[k][1]) + (flag ? " *" : ""));
        const intensity = Number.isFinite(v) && max > min ? (v - min) / (max - min) : 0.35;
        btn.style.setProperty("--heat", Math.round(12 + 45 * intensity) + "%");
        btn.setAttribute(
          "aria-label",
          m.rpms[i] +
            " rpm, " +
            Math.round(100 * m.loads[j]) +
            " percent, " +
            series[k][0] +
            ", " +
            number(v, 2) +
            (flag ? ", flagged" : ""),
        );
        btn.setAttribute("aria-pressed", String(i === active[0] && j === active[1]));
        btn.onclick = () => {
          active = [i, j];
          heatmap(true);
        };
        td.append(btn);
        tr.append(td);
      });
      body.append(tr);
    });
    $("cal-table").replaceChildren(head, body);
    set(
      "cal-map-note",
      series[k][0] + ". An asterisk marks an operating constraint or missing evidence.",
    );
    point();
    if (focus) $("cal-table").querySelector('[aria-pressed="true"]')?.focus();
  }
  function sample() {
    const w = result?.wltc;
    if (!w) return;
    const [t, v, cat, oil] = w.curve[Number(time.value)];
    set("cal-time-label", fmt(t) + " s");
    set(
      "cal-sample",
      number(v) + " km/h · " + w.catalyst + " " + number(cat) + " °C · oil " + number(oil) + " °C",
    );
    cursor?.setAttribute("x1", 42 + (473 * t) / 1800);
    cursor?.setAttribute("x2", 42 + (473 * t) / 1800);
  }
  function chart(w) {
    const plot = $("cal-chart");
    plot.replaceChildren();
    const peak = Math.max(400, Math.ceil(Math.max(...w.curve.map((p) => p[2])) / 100) * 100);
    const x = (t) => 42 + (473 * t) / 1800,
      y = (v, m) => 157 - (126 * v) / m;
    function add(tag, attrs, label) {
      const n = svg(tag, attrs, label);
      plot.append(n);
      return n;
    }
    for (const v of [0, 0.5, 1]) {
      add("line", { x1: 42, x2: 515, y1: y(v, 1), y2: y(v, 1), stroke: "var(--line)" });
      add("text", { x: 36, y: y(v, 1) + 4, "text-anchor": "end" }, String(v * 140));
      add("text", { x: 522, y: y(v, 1) + 4 }, String(Math.round(v * peak)));
    }
    for (const t of [0, 589, 1022, 1477, 1800]) {
      add("line", {
        x1: x(t),
        x2: x(t),
        y1: 31,
        y2: 157,
        stroke: "var(--line)",
        "stroke-dasharray": "2 3",
      });
      add("text", { x: x(t), y: 176, "text-anchor": "middle" }, String(t));
    }
    add("text", { x: 12, y: 17, class: "cal-speed-label" }, "Speed · km/h");
    add(
      "text",
      { x: 548, y: 17, "text-anchor": "end", class: "cal-cat-label" },
      w.catalyst + " · °C",
    );
    add("text", { x: 279, y: 197, "text-anchor": "middle" }, "Cycle time · s");
    add("line", {
      x1: 42,
      x2: 515,
      y1: y(300, peak),
      y2: y(300, peak),
      stroke: "var(--orange)",
      "stroke-dasharray": "4 4",
      opacity: ".42",
    });
    for (const [col, lim, color] of [
      [1, 140, "var(--chart)"],
      [2, peak, "var(--orange)"],
    ]) {
      add("polyline", {
        points: w.curve.map((p) => x(p[0]).toFixed(1) + "," + y(p[col], lim).toFixed(1)).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 2,
      });
    }
    cursor = add("line", { y1: 31, y2: 157, stroke: "var(--ink)", "stroke-width": 1.5 });
    time.max = String(w.curve.length - 1);
    time.value = String(Math.min(Number(time.value), w.curve.length - 1));
    sample();
  }
  function draw() {
    if (!result) return;
    const w = result.wltc;
    $("cal-output").hidden = !w;
    set("cal-message", w ? "" : result.reasons.join(". "));
    if (!w) return;
    heatmap();
    chart(w);
    $("cal-totals").replaceChildren(
      ...[
        ["Mixed fuel", w.traceFollowed ? number(w.litres100, 2) + " L/100 km" : "Trace unmet"],
        [
          w.catalyst + " · 300 °C",
          w.lightOffS === null ? "Unreached" : number(w.lightOffS, 1) + " s",
        ],
      ].map(([label, value]) => {
        const div = make("div");
        div.append(make("small", "", label), make("strong", "", value));
        return div;
      }),
    );
    $("cal-phases").replaceChildren(
      ...w.phases.map((p) => {
        const tr = make("tr");
        tr.append(
          make("td", "", p.name),
          make("td", "", number(p.distanceM / 1000, 3)),
          make("td", "", number(p.litres100, 2)),
        );
        return tr;
      }),
    );
    const o = w.oil,
      c = result.map.cold;
    set(
      "cal-durability",
      "−30 °C enrichment · " +
        (c.factor === null ? c.status : number(c.factor, 2) + " × warm dose") +
        "  /  Model oil-drain ceiling · " +
        number(o.modelDrainKm, 0) +
        " km (" +
        o.limiting +
        ").",
    );
    set(
      "cal-limits",
      "One cycle retains " +
        number(o.retainedWaterG, 3) +
        " g retained water, " +
        number(o.retainedFuelG, 3) +
        " g fuel and " +
        number(o.acidGkoh, 5) +
        " g KOH-equivalent acid. " +
        (result.reasons.join(". ") || "Modeled architecture gates passed") +
        ".",
    );
  }
  function chosen() {
    return fuel.value === "reference"
      ? engine.value === "diesel"
        ? "diesel100"
        : "ai95100"
      : fuel.value;
  }
  async function choose() {
    const n = ++sequence,
      key = chosen(),
      i = index || initial.report,
      h = i.entries[key];
    result = null;
    cursor = null;
    $("cal-output").hidden = true;
    $("cal-downloads").hidden = !index?.protocols?.[key];
    set("cal-message", "Loading calibration…");
    try {
      let row = cache.get(h);
      if (!row) {
        const data = await bytes(feedRoot + "calibration/" + encodeURIComponent(key) + ".json", h);
        row = JSON.parse(new TextDecoder().decode(data));
        if (row.id !== key || row.model !== i.model) throw Error();
        cache.set(h, row);
      }
      if (n !== sequence) return;
      result = row.architectures[engine.value];
      draw();
    } catch {
      if (n === sequence)
        set("cal-message", "This calibration could not be verified. Reselect the fuel to retry.");
    }
  }
  async function download(ext) {
    const key = chosen(),
      record = index?.protocols[key];
    if (!record) return;
    const path = "dossiers/stage3/" + index.model + "/" + key;
    if (record.path !== path) return;
    try {
      const data = await bytes(
        new URL("../" + path + "/protocol." + ext, feedRoot).href,
        ext === "md" ? record.mdSha256 : record.jsonSha256,
      );
      const url = URL.createObjectURL(
        new Blob([data], { type: ext === "md" ? "text/markdown" : "application/json" }),
      );
      const a = make("a");
      a.href = url;
      a.download = key + "-dyno-protocol." + ext;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      set("cal-message", "Protocol download failed the integrity check.");
    }
  }
  engine.onchange = () => {
    setMetrics();
    choose();
  };
  fuel.onchange = choose;
  metric.onchange = () => heatmap();
  time.oninput = sample;
  $("cal-md").onclick = () => download("md");
  $("cal-json").onclick = () => download("json");
  setMetrics();
  return (state, second, third) => {
    const ids = new Set(state.results.map((r) => r.id));
    index =
      second &&
      Array.isArray(second.nominated) &&
      second.funnel &&
      third?.model === initial.report.model &&
      third.schema === 1 &&
      third.stage1Model === state.model &&
      third.stage2Model === second?.model &&
      third.generation === state.generation &&
      second?.generation === state.generation &&
      third.tested === state.tested &&
      Array.isArray(third.eligible) &&
      third.eligible.every((k) => ids.has(k) && second.nominated.includes(k)) &&
      third.eligible.length === second.funnel.passed &&
      third.champions &&
      third.protocols &&
      [...initial.report.controls, ...third.eligible].every((k) =>
        /^[a-f0-9]{64}$/.test(third.entries?.[k]),
      )
        ? third
        : null;
    live = Boolean(index && index !== initial.report);
    const old = fuel.value;
    const labels = new Map(state.results.map((r) => [r.id, r.name]));
    fuel.replaceChildren(
      option("reference", "Matched road reference"),
      ...(index?.eligible || []).map((k) => option(k, labels.get(k))),
    );
    fuel.value = index?.eligible.includes(old) ? old : "reference";
    set(
      "cal-funnel",
      index
        ? index.eligible.length +
            " survivors · " +
            Object.keys(index.champions).length +
            " golden candidates"
        : "Matching Stage 3 checkpoint pending",
    );
    set(
      "cal-source",
      (live ? "Live Stage 3 · generation " + index.generation : "Calculated reference maps") +
        (!index
          ? " · Waiting for a matching qualification checkpoint."
          : index.eligible.length
            ? " · Only Stage 2 survivors enter qualification."
            : " · Showing control fuels while the shortlist is empty."),
    );
    choose();
  };
};
