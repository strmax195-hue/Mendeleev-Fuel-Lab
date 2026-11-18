(() => {
  "use strict";
  const M = globalThis.FUEL_MODEL,
    F = globalThis.FuelPhysics,
    seed = globalThis.FUEL_SEED;
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, value) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value !== undefined) e.textContent = value;
    return e;
  };
  const option = (value, label) => new Option(label, value);
  const fmt = (n, d = 0) =>
    Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const set = (id, t) => {
    $(id).textContent = t;
  };
  const svg = (tag, attrs, text) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  function lines(parent, entries) {
    parent.replaceChildren(
      ...entries.map(([key, val]) => {
        const d = make("div");
        d.append(make("dt", "", key), make("dd", "", val));
        return d;
      }),
    );
  }
  function pv(target, points, dark = false) {
    const line = dark ? "#577664" : "var(--line)",
      ink = dark ? "#cedeCF" : "var(--muted)",
      color = dark ? "#d2ec9d" : "var(--chart)";
    const w = 465,
      h = 193,
      l = 44,
      r = 10,
      t = 9,
      b = 32,
      gw = w - l - r,
      gh = h - t - b;
    const maxV = Math.ceil(Math.max(...points.map((p) => p[1])) / 100) * 100;
    const maxP = Math.ceil(Math.max(...points.map((p) => p[2])) / 20) * 20;
    const x = (v) => l + (v / maxV) * gw,
      y = (p) => t + gh - (p / maxP) * gh;
    target.replaceChildren();
    function label(a, b, value, anchor = "middle") {
      target.append(
        svg(
          "text",
          {
            x: a,
            y: b,
            fill: ink,
            "font-size": 9,
            "font-family": "monospace",
            "text-anchor": anchor,
          },
          value,
        ),
      );
    }
    for (let i = 0; i <= 4; i++) {
      const p = (i * maxP) / 4;
      target.append(
        svg("path", {
          d: "M" + l + " " + y(p) + "h" + gw,
          stroke: line,
          "stroke-dasharray": "2 4",
        }),
      );
      label(l - 7, y(p) + 3, fmt(p), "end");
    }
    for (let i = 0; i <= 6; i++) {
      const v = (i * maxV) / 6;
      target.append(
        svg("path", {
          d: "M" + x(v) + " " + t + "v" + gh,
          stroke: line,
          "stroke-dasharray": "2 4",
        }),
      );
      label(x(v), h - b + 13, fmt(v));
    }
    const d =
      points
        .map((p, i) => (i ? "L" : "M") + x(p[1]).toFixed(2) + " " + y(p[2]).toFixed(2))
        .join(" ") + " Z";
    target.append(
      svg("path", {
        d,
        fill: color,
        "fill-opacity": 0.13,
        stroke: color,
        "stroke-width": 2.2,
        "stroke-linejoin": "round",
      }),
    );
    label(4, 26, "bar", "start");
    label(l + gw / 2, h - 2, "Cylinder volume · cm³");
  }
  let state = seed,
    byId,
    selected,
    activeElement = "C",
    benchRow,
    elementCandidate;
  const numericKeys = [
    "range",
    "index",
    "netEnergyReturn",
    "carbon",
    "climate",
    "mjKg",
    "mjL",
    "ci",
    "synthesisMjKg",
    "flameK",
    "infra",
    "rho",
    "afr",
  ];
  function valid(s) {
    if (
      !s ||
      s.schema !== seed.schema ||
      s.model !== seed.model ||
      s.total !== seed.total ||
      !Number.isInteger(s.generation) ||
      s.generation < 1 ||
      !Array.isArray(s.results) ||
      s.results.length !== s.tested ||
      s.tested < 1 ||
      s.tested > s.total ||
      !Array.isArray(s.baselines) ||
      s.baselines.length !== 2 ||
      !Array.isArray(s.frontier) ||
      !Array.isArray(s.synergies) ||
      !Array.isArray(s.records)
    )
      return false;
    const ids = new Set();
    for (const r of [...s.results, ...s.baselines]) {
      if (
        !r ||
        typeof r.name !== "string" ||
        typeof r.id !== "string" ||
        ids.has(r.id) ||
        !numericKeys.every((k) => Number.isFinite(r[k])) ||
        !["Otto", "Diesel"].includes(r.preferred) ||
        !["Otto", "Diesel"].every(
          (k) => Number.isFinite(r.cycles?.[k]?.eta) && r.cycles[k].eta > 0 && r.cycles[k].eta < 1,
        ) ||
        !r.atoms ||
        !r.exhaust ||
        !["solarPct", "soilDays", "waterDays"].every(
          (k) => Number.isFinite(r.baselines?.[k]) && r.baselines[k] > 0,
        ) ||
        !Array.isArray(r.baselines.routes) ||
        !r.baselines.routes.every((s) => typeof s === "string")
      )
        return false;
      try {
        F.validate(r.parts, s.baselines.includes(r));
      } catch {
        return false;
      }
      if (
        r.id !==
        Object.keys(r.parts)
          .sort()
          .map((k) => k + r.parts[k])
          .join("-")
      )
        return false;
      ids.add(r.id);
    }
    return s.frontier.every((id) => ids.has(id));
  }
  function selectResult(id) {
    if (!byId.has(id)) return;
    selected = id;
    const r = byId.get(id);
    set("pick-name", r.name);
    lines($("pick-metrics"), [
      ["Physical performance", fmt(r.index, 1) + " / 100"],
      ["50 L range", fmt(r.range) + " km"],
      ["Net energy return", fmt(r.netEnergyReturn, 2) + " MJ/MJ"],
      [
        r.solarToTankPct === null ? "Solar-to-tank comparator" : "Solar to tank",
        fmt(r.solarToTankPct ?? r.baselines.solarPct, 3) + "% · " + r.baselines.routes.join(" + "),
      ],
      [
        "Soil / water half-life · baseline",
        fmt(r.baselines.soilDays, 1) + " / " + fmt(r.baselines.waterDays, 1) + " days",
      ],
      ["Synthesis energy", fmt(r.synthesisMj100, 1) + " MJ/100 km"],
      ["Lifecycle", fmt(r.climate, 1) + " g CO₂e/km"],
      ["Tailpipe carbon balance", fmt(r.carbon, 1) + " g CO₂/km"],
      ["Preferred cycle", r.preferred],
    ]);
    plotScatter();
  }
  function plotScatter() {
    const target = $("scatter"),
      front = new Set(state.frontier);
    const visible = $("front-only").checked
      ? state.results.filter((r) => front.has(r.id))
      : state.results;
    const rows = [...visible, ...state.baselines],
      xMax = Math.max(...rows.map((r) => r.netEnergyReturn)) * 1.12,
      yMax = Math.max(...rows.map((r) => r.range)) * 1.12;
    const x = (n) => 57 + (n / xMax) * 533,
      y = (n) => 248 - (n / yMax) * 222;
    target.replaceChildren();
    function label(a, b, s, anchor = "middle") {
      target.append(
        svg(
          "text",
          {
            x: a,
            y: b,
            fill: "var(--muted)",
            "font-family": "monospace",
            "font-size": 10,
            "text-anchor": anchor,
          },
          s,
        ),
      );
    }
    for (let i = 0; i <= 4; i++) {
      const a = x((xMax * i) / 4),
        b = y((yMax * i) / 4);
      target.append(
        svg("path", {
          d: "M57 " + b + "H590 M" + a + " 26V248",
          stroke: "var(--line)",
          "stroke-dasharray": "3 5",
        }),
      );
      label(a, 265, fmt((xMax * i) / 4, 1));
      label(49, b + 3, fmt((yMax * i) / 4), "end");
    }
    label(58, 15, "50 L range · km", "start");
    label(320, 289, "Tank energy / synthesis input · MJ/MJ");
    const maxCI = Math.max(
      ...state.baselines.map((r) => r.climate),
      ...state.results.map((r) => r.climate),
    );
    rows.sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
    for (const r of rows) {
      const px = x(r.netEnergyReturn),
        py = y(r.range),
        ref = state.baselines.includes(r);
      const color = "hsl(" + Math.round(150 - 140 * Math.min(1, r.climate / maxCI)) + " 42% 43%)";
      const point = ref
        ? svg("rect", {
            x: px - 5,
            y: py - 5,
            width: 10,
            height: 10,
            transform: "rotate(45 " + px + " " + py + ")",
          })
        : svg("circle", { cx: px, cy: py, r: r.id === selected ? 6 : front.has(r.id) ? 4.8 : 3.3 });
      point.setAttribute("fill", ref ? "var(--panel)" : color);
      point.setAttribute(
        "stroke",
        ref || r.id === selected ? "var(--ink)" : front.has(r.id) ? "var(--chart)" : "none",
      );
      point.setAttribute("stroke-width", r.id === selected ? 2.5 : 1.3);
      const title =
        r.name +
        " · " +
        fmt(r.range) +
        " km · " +
        fmt(r.netEnergyReturn, 2) +
        " MJ/MJ · " +
        fmt(r.climate, 1) +
        " g CO₂e/km";
      point.append(svg("title", {}, title));
      point.setAttribute("aria-label", title);
      point.style.cursor = "pointer";
      point.addEventListener("click", () => selectResult(r.id));
      if (front.has(r.id) || ref) {
        point.setAttribute("tabindex", "0");
        point.setAttribute("role", "button");
        point.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectResult(r.id);
          }
        });
      }
      target.append(point);
    }
  }
  function leaderboard() {
    const sort = $("rank").value,
      sign = sort === "climate" ? 1 : -1;
    const sorted = [...state.results].sort(
      (a, b) => sign * (a[sort] - b[sort]) || a.id.localeCompare(b.id),
    );
    $("leaders").replaceChildren(
      ...sorted.slice(0, 8).map((r) => {
        const tr = make("tr"),
          td = make("td"),
          btn = make("button", "", r.name);
        btn.onclick = () => selectResult(r.id);
        td.append(btn);
        tr.append(
          td,
          ...[fmt(r.index, 1), fmt(r.range), fmt(r.netEnergyReturn, 2), fmt(r.climate, 1)].map(
            (s) => make("td", "", s),
          ),
        );
        return tr;
      }),
    );
    set(
      "anomalies",
      fmt(state.synergies.length) +
        " nonlinear synergy anomalies pass the parent-mixture and both road-reference tests.",
    );
  }
  function elementMap() {
    const target = $("periodic");
    target.replaceChildren();
    for (const e of M.elements) {
      const active = ["C", "O", "H"].includes(e.symbol);
      const btn = make("button", "element " + (active ? "carrier" : e.role ? "material" : "other"));
      btn.style.gridRow = e.row;
      btn.style.gridColumn = e.col;
      btn.dataset.symbol = e.symbol;
      btn.title = e.name;
      btn.setAttribute("aria-label", e.name + " · atomic number " + e.z);
      btn.append(make("small", "", e.z), make("b", "", e.symbol));
      btn.onclick = () => inspectElement(e.symbol);
      target.append(btn);
    }
  }
  function inspectElement(symbol) {
    activeElement = symbol;
    for (const btn of $("periodic").children)
      btn.setAttribute("aria-pressed", String(btn.dataset.symbol === symbol));
    const e = M.elements.find((el) => el.symbol === symbol),
      card = $("element-detail");
    const top = make("div", "specimen");
    top.append(
      make("strong", "symbol", e.symbol),
      make("span", "eyebrow", "Atomic no. " + fmt(e.z)),
    );
    card.replaceChildren(
      top,
      make("h3", "", e.name),
      make(
        "p",
        "",
        e.role ||
          "Periodic-table reference. This element has no admitted liquid fuel component in the survey.",
      ),
    );
    for (const [label, ppm] of [
      ["Continental crust", e.ppm],
      ["Dry atmosphere", e.airPpm],
      ["Seawater", e.oceanPpm],
    ]) {
      if (ppm != null) card.append(make("p", "", label + " · " + fmt(ppm, 1) + " ppm by mass"));
    }
    const matches = state.results.filter((r) => symbol === "N" || r.atoms[symbol] > 0);
    card.append(
      make("hr"),
      make(
        "p",
        "",
        (symbol === "N" ? "Atmospheric nitrogen in " : "Fuel constituent in ") +
          fmt(matches.length) +
          " tested compositions.",
      ),
    );
    if (!matches.length) return;
    const choose = make("select");
    choose.setAttribute("aria-label", "Tested composition for " + e.name);
    for (const r of [...matches].sort((a, b) => b.index - a.index))
      choose.add(option(r.id, r.name));
    if (matches.some((r) => r.id === elementCandidate)) choose.value = elementCandidate;
    const info = make("p"),
      out = make("p");
    card.append(choose, info, out);
    function details() {
      elementCandidate = choose.value;
      const r = byId.get(elementCandidate);
      info.textContent =
        fmt(r.mjL, 1) +
        " MJ/L · " +
        state.baselines
          .map(
            (b) => fmt((100 * r.mjL) / b.mjL) + "% of " + M.stocks[Object.keys(b.parts)[0]].short,
          )
          .join(", ") +
        ".";
      out.textContent =
        "Stoichiometric kg/kg fuel · CO₂ " +
        fmt(r.exhaust.CO2, 2) +
        " · H₂O " +
        fmt(r.exhaust.H2O, 2) +
        " · N₂ " +
        fmt(r.exhaust.N2, 2) +
        " · oxides 0.";
    }
    choose.onchange = details;
    details();
  }
  let fractions = { eth: 70, ipa: 20, water: 10 };
  function buildSliders(reset) {
    const menu = $("family");
    const fixed = menu.value === "4";
    const family = fixed
      ? Object.keys(M.microemulsion)
      : M.families[menu.selectedOptions[0].dataset.family ?? menu.value];
    if (reset)
      fractions = fixed
        ? { ...M.microemulsion }
        : family.length === 3
          ? { [family[0]]: 70, [family[1]]: 20, [family[2]]: 10 }
          : family.length === 2
            ? { eth: 80, dmc: 20 }
            : { [family[0]]: 100 };
    const block = $("fractions");
    block.replaceChildren();
    family.forEach((key, i) => {
      const row = make("div", "slider-row"),
        label = make("label", "", M.stocks[key].name),
        out = make("output", "", fractions[key] + " mol%");
      out.id = "pct-" + key;
      label.append(out);
      row.append(label);
      if (i > 0 && !fixed) {
        const input = make("input");
        input.type = "range";
        input.min = 0;
        input.max = key === "water" ? 20 : 100;
        input.step = 1;
        input.value = fractions[key];
        input.id = "slider-" + key;
        label.htmlFor = input.id;
        input.oninput = () => {
          const others = family.slice(1).filter((k) => k !== key);
          fractions[key] = Number(input.value);
          for (const k of others) fractions[k] = Math.min(fractions[k], 100 - fractions[key]);
          fractions[family[0]] = 100 - family.slice(1).reduce((s, k) => s + fractions[k], 0);
          for (const k of family) {
            set("pct-" + k, fractions[k] + " mol%");
            if ($("slider-" + k)) $("slider-" + k).value = fractions[k];
          }
          runBench();
        };
        row.append(input);
      }
      block.append(row);
    });
    runBench();
  }
  function runBench() {
    const parts = Object.fromEntries(Object.entries(fractions).filter(([, x]) => x > 0));
    benchRow = F.evaluate(parts, false, true);
    Object.assign(benchRow, F.score(benchRow, state.baselines[0]));
    const cy = $("cycle").value,
      c = benchRow.cycles[cy],
      trip = F.drive(benchRow, "Sedan", 110, cy);
    const fields = [
      ["Tank range", fmt(trip.range) + " km"],
      ["Indicated efficiency", fmt(c.eta * 100, 1) + "%"],
      ["Peak pressure", fmt(c.peakBar, 1) + " bar"],
    ];
    $("bench-numbers").replaceChildren(
      ...fields.map(([k, v]) => {
        const b = make("div");
        b.append(make("small", "", k), make("strong", "", v));
        return b;
      }),
    );
    set("phase", benchRow.phase + " · 25 °C");
    pv($("bench-pv"), c.pv);
    globalThis.FuelCylinder.bench(benchRow, cy);
    set(
      "bench-extra",
      "Charge cooling " +
        fmt(298.15 - c.chargeK, 1) +
        " K · Flame " +
        fmt(benchRow.flameK) +
        " K · End-compression T/T₀ " +
        fmt(c.knockProxy, 2) +
        " · Equilibrium NO " +
        fmt(c.noPpm) +
        " ppm · Bubble pressure " +
        fmt(benchRow.vaporKpa, 1) +
        " kPa · Bubble point " +
        fmt(benchRow.bubbleK - 273.15, 1) +
        " °C · " +
        fmt(benchRow.mjKg, 1) +
        " MJ/kg.",
    );
    $("mixture-bar").replaceChildren(
      ...Object.values(fractions).map((x, i) => {
        const el = make("i");
        el.style.width = x + "%";
        el.style.background = ["#6c9558", "#df8d53", "#94b7b6"][i];
        return el;
      }),
    );
    if ($("lane-a").value === "bench" || $("lane-b").value === "bench") race();
  }
  function pumpOptions() {
    for (const [id, fallback] of [
      ["lane-a", "ai95100"],
      ["lane-b", "b100100"],
    ]) {
      const sel = $(id),
        old = sel.value;
      sel.replaceChildren();
      for (const r of [...state.baselines, ...[...state.results].sort((a, b) => b.index - a.index)])
        sel.add(option(r.id, r.name));
      sel.add(option("bench", "Current lab blend"));
      sel.value = old === "bench" || byId.has(old) ? old : fallback;
    }
  }
  function race() {
    const vehicle = $("vehicle").value,
      speed = Number($("speed").value);
    const rows = ["lane-a", "lane-b"].map((id) =>
      $(id).value === "bench" ? benchRow : byId.get($(id).value),
    );
    if (rows.some((r) => !r)) return;
    const runs = rows.map((r) =>
      F.drive(r, vehicle, speed, r === benchRow ? $("cycle").value : r.preferred),
    );
    $("lanes").replaceChildren(
      ...rows.map((r, i) => {
        const cy = r === benchRow ? $("cycle").value : r.preferred,
          c = r.cycles[cy],
          d = runs[i],
          card = make("article", "lane");
        const distance = make("div", "distance", fmt(d.range) + " ");
        distance.append(make("small", "", "km"));
        const track = make("div", "lane-track"),
          fill = make("i");
        fill.style.width = (100 * d.range) / Math.max(...runs.map((x) => x.range)) + "%";
        track.append(fill);
        const dl = make("dl", "mini-dl");
        lines(dl, [
          ["Synthesis / 100 km", fmt(d.synthesisMj100, 1) + " MJ"],
          ["Lifecycle CO₂e", fmt(d.climate, 1) + " g/km"],
          ["Tailpipe CO₂ balance", fmt(d.carbon, 1) + " g/km"],
          ["Thermal stress index", fmt(c.heatScore, 1) + " / 100"],
          ["Hot NO equilibrium", fmt(c.noPpm) + " ppm"],
          ["Aero / rolling load", fmt(d.dragN) + " / " + fmt(d.rollN) + " N"],
        ]);
        card.append(
          make("small", "eyebrow", "Lane " + (i ? "B" : "A") + " · " + cy),
          make("h3", "", r.name),
          distance,
          track,
          dl,
        );
        return card;
      }),
    );
  }
  const feedRoot =
    "https://raw.githubusercontent.com/strmax195-hue/Mendeleev-Fuel-Lab/lab-data/data/";
  const attachWeather = globalThis.FuelWeather({ $, make, set, fmt, lines, option, feedRoot });
  const attachCalibration = globalThis.FuelCalibration({
    $,
    make,
    set,
    fmt,
    lines,
    option,
    svg,
    feedRoot,
  });
  const attachPlanetary = globalThis.FuelPlanetary({ $, make, set, fmt, lines, option, feedRoot });
  let planetaryIndex = globalThis.FUEL_PLANETARY.report;
  let weatherIndex = globalThis.FUEL_WEATHER.report;
  let calibrationIndex = globalThis.FUEL_CALIBRATION.report;
  function render() {
    byId = new Map([...state.baselines, ...state.results].map((r) => [r.id, r]));
    const lead = [...state.results].sort((a, b) => b.index - a.index)[0];
    set("stat-progress", fmt((100 * state.tested) / state.total, 1) + "%");
    $("progress-bar").style.width = (100 * state.tested) / state.total + "%";
    set("count", fmt(state.tested) + " / " + fmt(state.total) + " tested");
    set("stat-index", fmt(lead.index, 1));
    set("index-label", lead.name);
    set("stat-range", fmt(Math.max(...state.results.map((r) => r.range))) + " km");
    set("stat-front", fmt(state.frontier.length));
    set("front-label", "Range, energy & climate");
    inspectElement(activeElement);
    selectResult(byId.has(selected) ? selected : lead.id);
    leaderboard();
    pumpOptions();
    race();
    attachWeather(state, weatherIndex);
    attachCalibration(state, weatherIndex, calibrationIndex);
    attachPlanetary(state, calibrationIndex, planetaryIndex);
    globalThis.FuelCylinder.catalogue(state);
  }
  const media = matchMedia("(prefers-color-scheme: dark)");
  document.documentElement.dataset.theme = media.matches ? "dark" : "light";
  $("theme").onclick = () => {
    const d = document.documentElement;
    d.dataset.theme = d.dataset.theme === "dark" ? "light" : "dark";
  };
  elementMap();
  for (const v of Object.keys(M.vehicles)) $("vehicle").add(option(v, v));
  $("family").onchange = () => buildSliders(true);
  $("cycle").onchange = runBench;
  $("rank").onchange = leaderboard;
  $("front-only").onchange = plotScatter;
  $("send-race").onclick = () => {
    $("lane-b").value = selected;
    race();
    location.hash = "race";
  };
  for (const id of ["vehicle", "speed", "lane-a", "lane-b"]) $(id).onchange = race;
  render();
  buildSliders(false);
  const gas = F.evaluate({ ai95: 100 }, true, true);
  pv($("hero-pv"), gas.cycles.Otto.pv, true);
  set("peak-caption", fmt(gas.cycles.Otto.peakBar, 1) + " bar peak");
  set("feed", "Calculated seed · generation " + state.generation);
  async function refresh() {
    if (location.protocol === "file:") return;
    const query = "?window=" + Math.floor(Date.now() / 1200000);
    async function read(name) {
      const r = await fetch(feedRoot + name + query, {
        cache: "no-cache",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Error("Feed unavailable");
      return r.json();
    }
    try {
      const [incoming, index, third, fourth] = await Promise.all([
        read("state.json"),
        read("stage2.json").catch(() => null),
        read("stage3.json").catch(() => null),
        read("stage4.json").catch(() => null),
      ]);
      if (!valid(incoming) || incoming.tested < state.tested)
        throw Error("Incompatible checkpoint");
      if (index || incoming.generation !== state.generation) weatherIndex = index;
      if (third || incoming.generation !== state.generation) calibrationIndex = third;
      if (fourth || incoming.generation !== state.generation) planetaryIndex = fourth;
      state = incoming;
      render();
      set(
        "feed",
        "Live branch · generation " +
          fmt(state.generation) +
          " · " +
          fmt(state.tested) +
          " verified",
      );
    } catch {
      set(
        "feed",
        state === seed
          ? "Calculated seed · live feed unavailable"
          : "Last verified branch snapshot · generation " + fmt(state.generation),
      );
    }
  }
  refresh();
  setInterval(refresh, 1200000);
})();
