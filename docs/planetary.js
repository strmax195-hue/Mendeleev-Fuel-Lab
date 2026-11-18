/* Planetary evidence for an architecture-qualified calculation. */
globalThis.FuelPlanetary = function ({ $, make, set, fmt, lines, option, feedRoot }) {
  const seed = globalThis.FUEL_PLANETARY,
    select = $("planet-case");
  const cache = new Map(
    Object.entries(seed.rows).map(([key, packet]) => [seed.report.entries[key], packet]),
  );
  const engines = { mpi: "MPI", gdi: "GDI turbo", diesel: "Common-rail diesel" };
  let active = null,
    revision = 0;
  async function draw() {
    const tick = ++revision,
      source = active || seed.report,
      id = select.value;
    const [key, arch] = id.split("/"),
      hash = source.entries[id];
    $("planet-metrics").replaceChildren();
    $("planet-peer").hidden = true;
    set("planet-fate", "");
    set("planet-verify", "");
    set("planet-state", "Reading audit…");
    try {
      let packet = cache.get(hash);
      if (!packet) {
        const r = await fetch(feedRoot + "planetary/" + id + ".json?h=" + hash, {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) throw Error();
        const bytes = await r.arrayBuffer();
        const checksum = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (x) => x.toString(16).padStart(2, "0"),
        ).join("");
        if (checksum !== hash) throw Error();
        packet = JSON.parse(new TextDecoder().decode(bytes));
        cache.set(hash, packet);
      }
      const p = packet.payload;
      if (
        p.model !== source.model ||
        p.candidate !== key ||
        p.architecture !== arch ||
        packet.sha256 !== source.physicsHashes[id]
      )
        throw Error();
      if (tick !== revision) return;
      const f = p.resources,
        b = p.biosphere,
        spill = b.spill,
        finalist = Boolean(active?.finalists[key]?.includes(arch));
      const amount = (n) =>
        new Intl.NumberFormat("en", { notation: "scientific", maximumFractionDigits: 3 }).format(n);
      set(
        "planet-state",
        (finalist ? "Stage 4 finalist" : "Reference calculation") +
          " · " +
          (p.outcome === "passed"
            ? "All ecological gates cleared"
            : p.outcome === "failed"
              ? "Ecological gate failed"
              : "Further evidence required"),
      );
      $("planet-peer").hidden = !(finalist && source.peerReproduced[id] === packet.sha256);
      lines($("planet-metrics"), [
        ["Fleet duty", fmt(f.vehicles) + " vehicles · " + fmt(f.kmPerVehicleYear) + " km/year"],
        ["Annual fuel", amount(f.litresYear) + " L"],
        ["Net energy return", fmt(f.netEnergyReturn, 3) + " MJ/MJ"],
        [
          f.solarToTankPct === null ? "Solar-to-tank comparator" : "Solar to tank",
          fmt(f.solarToTankPct ?? f.comparisonSolarPct, 3) +
            "% · " +
            f.comparisonRoutes.join(" + "),
        ],
        ["Water equivalent / annual allocation", fmt(f.annualWaterEquivalent.usePct, 3) + "%"],
        ["Crop carbon / annual allocation", fmt(f.annualCropCarbon.usePct, 3) + "%"],
        ["Gross CO₂ return", amount(f.co2ReturnKgYear) + " kg/year"],
        ["Atomic mass residual", b.massResidualKg + " kg/L"],
        ["Spill oxygen demand", fmt(spill.theoreticalOxygenDemandKgPerKg, 3) + " kg O₂/kg"],
        [
          "Soil / water half-life · baseline",
          fmt(spill.baselineSoilDt50Days, 1) +
            " / " +
            fmt(spill.baselineWaterDt50Days, 1) +
            " days",
        ],
        [
          "Aquifer organic half-life",
          spill.aquiferOrganicDt50Days
            ? spill.aquiferOrganicDt50Days.join("–") + " days, microcosm"
            : "Mixture evidence incomplete",
        ],
      ]);
      set(
        "planet-fate",
        "Renewable supply · " +
          p.gates.resourceSupply +
          ". Soil and water toxicity · " +
          (p.gates.soilAndWater === "unverified"
            ? "field exposure data required"
            : p.gates.soilAndWater) +
          ". Whole-path ozone depletion · " +
          (p.gates.ozone === "unverified" ? "pathway inventory required" : p.gates.ozone) +
          ". Zero greenhouse byproducts · " +
          p.gates.greenhouseByproducts +
          ". Actual material recovery requires measurements.",
      );
      set(
        "planet-verify",
        "Local replay · python cli/local_worker.py --stage 4 --candidate " +
          key +
          " --architecture " +
          arch +
          " --output audit.json",
      );
      if (finalist) {
        const link = make("a", "", "Submit independent physics hash");
        link.href =
          "https://github.com/strmax195-hue/Mendeleev-Fuel-Lab/issues/new?title=Independent%20planetary%20replay";
        $("planet-verify").append(" · ", link);
      }
    } catch {
      if (tick === revision) set("planet-state", "Unable to verify this planetary audit.");
    }
  }
  select.onchange = draw;
  return (state, third, fourth) => {
    const candidateKeys = new Set(state.results.map((r) => r.id));
    const good =
      fourth &&
      third &&
      fourth.schema === 4 &&
      fourth.model === seed.report.model &&
      fourth.stage1Model === state.model &&
      fourth.stage3Model === third.model &&
      fourth.generation === state.generation &&
      third.generation === state.generation &&
      fourth.tested === state.tested &&
      fourth.finalists &&
      fourth.peerReproduced &&
      Array.isArray(fourth.verified) &&
      Object.entries(fourth.finalists).every(
        ([k, arches]) =>
          candidateKeys.has(k) &&
          Array.isArray(arches) &&
          arches.every((a) => Object.hasOwn(engines, a) && third.champions[k]?.includes(a)),
      ) &&
      Object.keys(fourth.entries || {}).every(
        (k) =>
          /^[a-z0-9-]+\/(mpi|gdi|diesel)$/.test(k) &&
          /^[a-f0-9]{64}$/.test(fourth.entries[k]) &&
          /^[a-f0-9]{64}$/.test(fourth.physicsHashes?.[k]),
      );
    active = good ? fourth : null;
    const source = active || seed.report,
      old = select.value;
    const names = new Map([...state.results, ...state.baselines].map((r) => [r.id, r.name]));
    const keys = [...Object.keys(source.entries)].sort(
      (a, b) =>
        Number(b.split("/")[0] in source.finalists) - Number(a.split("/")[0] in source.finalists),
    );
    select.replaceChildren(
      ...keys.map((id) => {
        const [k, a] = id.split("/");
        return option(id, names.get(k) + " · " + engines[a]);
      }),
    );
    select.value = keys.includes(old)
      ? old
      : keys.includes("ai95100/mpi")
        ? "ai95100/mpi"
        : keys[0];
    set(
      "planet-source",
      active && active !== seed.report
        ? "Live Stage 4 · generation " + source.generation
        : "Calculated reference audits",
    );
    set(
      "planet-funnel",
      active
        ? Object.keys(source.finalists).length +
            " finalists · " +
            source.verified.length +
            " verified · " +
            Object.keys(source.peerReproduced).length +
            " peer replays"
        : "Matching Stage 4 checkpoint pending",
    );
    draw();
  };
};
