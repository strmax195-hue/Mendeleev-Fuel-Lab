/* Static Stage 2 reader. One independently hashed profile per selected formula. */
globalThis.FuelWeather = function ({ $, make, set, fmt, lines, option, feedRoot }) {
  const builtin = globalThis.FUEL_WEATHER;
  const cache = new Map(
    Object.entries(builtin.rows).map(([id, row]) => [builtin.report.entries[id], row]),
  );
  const fuel = $("weather-fuel"),
    car = $("weather-car"),
    slider = $("weather-temp");
  let report,
    stage1,
    current,
    request = 0;
  const num = (n, unit, digits = 2) => (n === null ? "Unavailable" : fmt(n, digits) + unit);
  const phase = (mask) => {
    const flags = [];
    if (mask & 1) flags.push("Liquid–liquid separation");
    if (mask & 2) flags.push("Solid / cloud-point risk");
    if (flags.length) return flags.join(" · ");
    return mask & 4 ? "Single-liquid prediction · needs data" : "Single liquid in the phase screen";
  };
  for (const [id, [name]] of Object.entries(builtin.report.hardware)) car.add(option(id, name));
  car.value = "stock";

  function startingReadings(trial) {
    if (!trial) return [];
    const label = trial.method === "glow-ci" ? "Glow-assisted CI" : "Direct-injection cold start";
    if (trial.status === "phase-blocked") return [[label, "Blocked by liquid phase"]];
    if (trial.status === "unsupported") return [[label, "Outside ignition model"]];
    const dose = trial.factor ?? trial.testedFactor;
    const verdict =
      trial.status === "feasible" ? "Within ignition window" : "Outside ignition window";
    const values = [[label, verdict + (dose ? " · " + fmt(dose, 2) + "× warm dose" : "")]];
    if (trial.chargeK != null)
      values.push(["Charge at spark", fmt(trial.chargeK, 1) + " K · φ " + fmt(trial.phi, 3)]);
    if (trial.peakLocalK != null)
      values.push(["Local pilot parcel", fmt(trial.peakLocalK, 1) + " K · φ " + fmt(trial.phi, 3)]);
    return values;
  }

  function draw() {
    const t = Number(slider.value);
    set("weather-degrees", (t > 0 ? "+" : "") + t + " °C");
    if (!current) return;
    const { screen: s, road, gate } = current;
    const [mask, bubble, cold, mu] = s.weather[t - builtin.report.minC];
    const [primary, electricity, eroi, litres] = road.weather[t - builtin.report.minC];
    const r = report || builtin.report;
    const selected = s.assemblies[car.value].filter(([start]) => start <= t).at(-1)[1];
    set("weather-phase", phase(mask));
    set("weather-verdict", "Material verdict · " + selected);
    const isControl = stage1.baselines.some((row) => row.id === current.id);
    const isNominee = r.nominated.includes(current.id);
    $("weather-status").dataset.outcome = isControl ? "control" : gate.status;
    set(
      "weather-status",
      isControl ? "Road reference" : (isNominee ? "Shortlist · " : "Preview · ") + gate.status,
    );
    lines($("weather-readings"), [
      ["RVP proxy · 37.8 °C", num(s.rvpKpa, " kPa")],
      ["Bubble pressure", num(bubble, " kPa")],
      [
        "Rail / inlet margin",
        bubble === null
          ? "Unavailable"
          : fmt(r.railKpa - bubble, 1) + " / " + fmt(r.inletKpa - bubble, 1) + " kPa",
      ],
      ...(s.cycle === "Otto" ? [["Ambient SI vapour", num(cold, " × lean limit", 3)]] : []),
      ...startingReadings(s.coldStart?.[t]),
      ["Dynamic viscosity", num(mu, " mPa·s", 3)],
      ["Wear proxy · 60 °C", fmt(s.wearBeforeUm) + " → " + fmt(s.wearUm) + " µm"],
      ["Bio-ester dose", fmt(s.doseVolPct, 1) + " vol%"],
      ["Fuel consumed / 100 km", fmt(litres, 2) + " L"],
      ["Wheel EROI", fmt(eroi, 3) + " ×"],
      ["Upstream primary energy", fmt(primary, 2) + " MJ/100 km"],
      ["Synthesis electricity", fmt(electricity, 2) + " kWh/100 km"],
    ]);
    $("weather-materials").replaceChildren(
      ...Object.entries(r.materials).map(([id, [name, low]]) => {
        const rating = low !== null && t < low ? "avoid" : s.chemical[id];
        return make("span", rating, name + " · " + rating);
      }),
    );
    set(
      "weather-gates",
      "Full envelope · " +
        gate.installation.verdict +
        (gate.installation.seals.length
          ? " · " + gate.installation.seals.join("/").toUpperCase()
          : "") +
        ". " +
        (gate.failures.join(". ") || "No modeled failures") +
        ". " +
        (gate.reviews.length ? "Further evidence · " + gate.reviews.join(". ") + "." : ""),
    );
  }

  async function choose() {
    const sequence = ++request,
      id = fuel.value;
    current = null;
    $("weather-body").hidden = true;
    $("weather-strip").replaceChildren();
    const hash = report?.entries[id] || builtin.report.entries[id];
    const live = Boolean(report && report !== builtin.report);
    set(
      "weather-source",
      live ? "Live Stage 2 · generation " + report.generation : "Calculated Stage 2 seed",
    );
    if (!hash) {
      set("weather-source", "Stage 2 feed unavailable for this generation");
      set("weather-message", "This formula is awaiting a matching weather profile.");
      return;
    }
    set("weather-message", "Loading weather profile…");
    try {
      let row = cache.get(hash);
      if (!row) {
        const response = await fetch(
          feedRoot + "weather/" + encodeURIComponent(id) + ".json?h=" + hash,
          {
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(12000),
          },
        );
        if (!response.ok) throw Error();
        const bytes = await response.arrayBuffer();
        const actual = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
        if (actual !== hash) throw Error();
        row = JSON.parse(new TextDecoder().decode(bytes));
        if (row.id !== id || row.model !== builtin.report.model || row.screen.weather.length !== 86)
          throw Error();
        cache.set(hash, row);
      }
      if (sequence !== request) return;
      current = row;
      $("weather-strip").replaceChildren(
        ...row.screen.weather.map(([mask]) =>
          make("i", mask & 3 ? "risk" : mask & 4 ? "review" : ""),
        ),
      );
      $("weather-body").hidden = false;
      set("weather-message", "");
      draw();
    } catch {
      if (sequence === request)
        set(
          "weather-message",
          "The selected profile could not be verified. Select it again to retry.",
        );
    }
  }

  function compatible(index, state) {
    return (
      index?.schema === 2 &&
      index.model === builtin.report.model &&
      index.stage1Model === state.model &&
      index.generation === state.generation &&
      index.tested === state.tested &&
      Array.isArray(index.nominated) &&
      index.funnel &&
      [...state.baselines, ...state.results].every((r) =>
        /^[a-f0-9]{64}$/.test(index.entries?.[r.id]),
      )
    );
  }
  fuel.onchange = choose;
  slider.oninput = draw;
  car.onchange = draw;
  return function attach(state, index) {
    stage1 = state;
    report = compatible(index, state) ? index : null;
    const previous = fuel.value;
    fuel.replaceChildren(
      ...[...state.results, ...state.baselines].map((r) => option(r.id, r.name)),
    );
    fuel.value = Array.from(fuel.options).some((o) => o.value === previous)
      ? previous
      : state.results[0].id;
    set(
      "weather-funnel",
      report
        ? report.nominated.length +
            " shortlisted · " +
            report.funnel.passed +
            " model passes · " +
            report.funnel.review +
            " in review · " +
            report.funnel.rejected +
            " rejected"
        : "Matching Stage 2 checkpoint pending",
    );
    const cold = report?.coldScreen;
    set(
      "weather-cold-summary",
      cold?.gdiFeasible != null
        ? "At −35 °C, " +
            cold.aboveLeanLimit +
            " of " +
            cold.evaluatedSI +
            " liquid SI candidates reach the ambient lean limit. The GDI charge model finds " +
            cold.gdiFeasible +
            " within the ignition window, including " +
            cold.gdiNeedsEnrichment +
            " using extra fuel. Glow-assisted CI clears " +
            cold.glowFeasible +
            " of " +
            cold.ciCandidates +
            " candidates, with " +
            cold.ciPhaseBlocked +
            " blocked by cold flow."
        : "",
    );
    choose();
  };
};
