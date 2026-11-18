/* MIT. One numerical kernel for Node discovery runs and the static observatory. */
(() => {
  "use strict";
  const M = globalThis.FUEL_MODEL,
    R = 8.31446261815324,
    T0 = 298.15,
    P0 = 101325;
  const mw = (atoms) => Object.entries(atoms).reduce((v, [s, n]) => v + n * M.weights[s], 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const dot = (a, b) => sum(a.map((v, i) => v * b[i]));
  const gases = ["CO2", "H2O", "N2", "O2", "CO", "H2", "NO"];
  const gasMass = gases.map((s) => M.cea[s].molar_mass);
  function raw(a, t) {
    const [a1, a2, a3, a4, a5, a6, a7] = a;
    return [
      R * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5)))),
      R * (a6 + t * (a1 + t * (a2 / 2 + t * (a3 / 3 + t * (a4 / 4 + (t * a5) / 5))))),
      R * (a1 * Math.log(t) + t * (a2 + t * (a3 / 2 + t * (a4 / 3 + (t * a5) / 4))) + a7),
    ];
  }
  const coeff = gases.map((s) => {
    const shift = (M.cea[s].hf_j_mol - raw(M.nasa[s][0], T0)[1]) / R;
    return M.nasa[s].map((a) => a.map((v, i) => (i === 5 ? v + shift : v)));
  });
  function properties(i, t) {
    if (!(t >= 200 && t <= 6000)) throw Error("Gas temperature outside NASA-7 intervals");
    return raw(coeff[i][Number(t >= 1000)], t);
  }
  function mixtureCoefficients(n) {
    return [0, 1].map((k) =>
      Array.from({ length: 7 }, (_, j) => sum(n.map((v, i) => v * coeff[i][k][j]))),
    );
  }
  function root(fn, lo, hi, guess, tol = 1e-5) {
    let fl = fn(lo),
      fh = fn(hi);
    if (!(fl <= 0 && fh >= 0))
      throw Error("Energy or phase root is outside the supported interval");
    let x = Math.max(lo, Math.min(hi, guess));
    for (let i = 0; i < 50; i++) {
      const f = fn(x);
      if (Math.abs(f) < tol || hi - lo < 1e-8) return x;
      const dx = 0.02,
        a = Math.max(lo, x - dx),
        b = Math.min(hi, x + dx);
      const slope = (fn(b) - fn(a)) / (b - a);
      if (f > 0) hi = x;
      else lo = x;
      const next = x - f / slope;
      x = Number.isFinite(next) && next > lo && next < hi ? next : (lo + hi) / 2;
    }
    throw Error("Bracketed Newton iteration did not converge");
  }
  // Equilibrium of CO2/CO, H2O/H2, O2 and N2/NO at prescribed P or V.
  function equilibrium(t, totals, constraint) {
    const [carbon, water, nitrogen, excess] = totals,
      props = gases.map((_, i) => properties(i, t));
    const g = props.map((p) => (p[1] - t * p[2]) / (R * t));
    const kc = Math.exp(g[0] - g[4] - 0.5 * g[3]),
      kh = Math.exp(g[1] - g[5] - 0.5 * g[3]);
    const kn = Math.exp(g[2] + g[3] - 2 * g[6]);
    let low = 0,
      high = Math.sqrt(
        constraint.p
          ? constraint.p / P0
          : ((sum(totals) + carbon + water) * R * t) / (constraint.v * P0),
      );
    let n;
    for (let i = 0; i < 48; i++) {
      const y = (low + high) / 2,
        co = (carbon * kc) / (kc + y),
        h2 = (water * kh) / (kh + y);
      const b = excess + (co + h2) / 2,
        d = (kn * (nitrogen + b)) / 2;
      const no =
        b > 0
          ? (2 * kn * nitrogen * b) / (d + Math.sqrt(d * d + 4 * (1 - kn / 4) * kn * nitrogen * b))
          : 0;
      n = [carbon - co, water - h2, nitrogen - no / 2, b - no / 2, co, h2, no];
      const po = constraint.p
        ? ((constraint.p / P0) * n[3]) / sum(n)
        : (n[3] * R * t) / (constraint.v * P0);
      if (y * y > po) high = y;
      else low = y;
    }
    const h = dot(
        n,
        props.map((p) => p[1]),
      ),
      u = h - sum(n) * R * t;
    return { n, h, u };
  }
  function burn(target, totals, constraint) {
    const key = constraint.p ? "h" : "u";
    const residual = (t) => equilibrium(t, totals, constraint)[key] - target;
    const t = root(residual, 900, 4500, 2250, 0.0001),
      gas = equilibrium(t, totals, constraint);
    return { ...gas, t, residual: gas[key] - target, target };
  }
  function validate(parts, reference = false) {
    if (!parts || typeof parts !== "object" || Array.isArray(parts))
      throw Error("A composition is required");
    const keys = Object.keys(parts);
    if (
      !keys.length ||
      keys.length > 3 ||
      keys.some(
        (k) => !Object.hasOwn(M.stocks, k) || !Number.isInteger(parts[k]) || parts[k] < 1,
      ) ||
      sum(Object.values(parts)) !== 100
    )
      throw Error("Use one to three registered liquids and integer mol% summing to 100");
    if (keys.length === 3 && keys.every((k) => parts[k] === M.microemulsion[k])) return keys;
    const isRef = keys.length === 1 && M.refs.includes(keys[0]);
    if (!(reference && isRef) && !M.families.some((f) => keys.every((k) => f.includes(k))))
      throw Error("Outside the compatible liquid families");
    if ((parts.water || 0) > 20) throw Error("Hydrous survey ceiling is 20 mol% water");
    return keys;
  }
  // Clausius-Clapeyron with a constant latent heat and measured normal boiling anchor.
  const sat = (s, t) => P0 * Math.exp((s.latent / R) * (1 / s.boil - 1 / t));
  function inventory(parts, reference = false) {
    const keys = validate(parts, reference),
      terms = keys.map((k) => [M.stocks[k], parts[k] / 100]);
    const atoms = { C: 0, H: 0, O: 0 },
      weighted = (fn) => sum(terms.map(([s, x]) => x * fn(s)));
    for (const [s, x] of terms)
      for (const [e, count] of Object.entries(s.atoms)) atoms[e] += x * count;
    const mass = mw(atoms) / 1000,
      volume = weighted((s) => mw(s.atoms) / 1000 / s.rho);
    const hf = weighted((s) => s.hf),
      o2 = atoms.C + atoms.H / 4 - atoms.O / 2;
    const lhv = hf - atoms.C * M.cea.CO2.hf_j_mol - (atoms.H / 2) * M.cea.H2O.hf_j_mol;
    const bubble = (t) => weighted((s) => sat(s, t)),
      vapor = bubble(T0);
    if (terms.some(([s]) => s.melt >= T0 || s.boil <= T0) || vapor >= P0 || lhv <= 0)
      throw Error("Ambient liquid or net-energy bounds failed");
    const bp = root((t) => bubble(t) - P0, 290, 750, 360);
    const cost = weighted((s) => (s.price * mw(s.atoms)) / 1000);
    const lifecycle = weighted((s) => {
      const m = mw(s.atoms) / 1000,
        c = s.atoms.C || 0,
        h = s.atoms.H || 0;
      const energy = (s.hf - c * M.cea.CO2.hf_j_mol - (h / 2) * M.cea.H2O.hf_j_mol) / 1e6;
      // Full pathway factors already include use. Gate factors add emitted carbon once.
      return s.ci !== null
        ? s.ci * energy
        : s.gateKg * m * 1000 + c * gasMass[0] + m * 1000 * (s.short === "Water" ? 0 : 0.03);
    });
    const abundance = sum(
      Object.entries(atoms).map(
        ([e, n]) => (((n * M.weights[e]) / (mass * 1000)) * Math.log10(1 + M.abundance[e])) / 6,
      ),
    );
    return {
      keys,
      terms,
      atoms,
      mass,
      volume,
      hf,
      o2,
      lhv,
      bp,
      vapor,
      cost,
      lifecycle,
      abundance,
      infra: 0.4 + 0.6 * weighted((s) => s.infra),
      cycle: keys.length === 1 ? M.stocks[keys[0]].cycle : "Otto",
    };
  }
  function charge(f, air) {
    const na = sum(air),
      a = mixtureCoefficients(air)[0],
      h0 = raw(a, T0)[1];
    function latent(t) {
      const partial = f.terms.map(([s, x]) => x * sat(s, t));
      const free = P0 - sum(partial);
      return sum(f.terms.map(([s, x], i) => Math.min(x, (na * partial[i]) / free) * s.latent));
    }
    const t = root((k) => raw(a, k)[1] - h0 + latent(k), 200, T0, T0 - 15);
    return { t, q: latent(t) };
  }
  function adiabat(n, tStart, vStart) {
    const a = mixtureCoefficients(n),
      nr = sum(n) * R,
      props = (t) => raw(a[Number(t >= 1000)], t);
    const sStart = props(tStart)[2];
    let previous = tStart;
    return (v) => {
      let t = previous;
      for (let i = 0; i < 12; i++) {
        const [cp, , s] = props(t);
        const ds = s - sStart - nr * Math.log(((t / tStart) * vStart) / v);
        if (Math.abs(ds) < 1e-8) {
          previous = t;
          return t;
        }
        t -= (ds * t) / (cp - nr);
      }
      throw Error("Isentropic stroke did not converge");
    };
  }
  function cycle(f, kind, trace = false, step = 2) {
    const diesel = kind === "Diesel",
      ratio = diesel ? 17 : 10.5,
      lambda = diesel ? 1.6 : 1;
    const oxygen = f.o2 * lambda,
      nitrogen = oxygen * 3.76;
    const air = [0, 0, nitrogen, oxygen, 0, 0, 0],
      totals = [f.atoms.C, f.atoms.H / 2, nitrogen, oxygen - f.o2];
    const intake = charge(f, air),
      na = sum(air),
      v1 = (na * R * intake.t) / P0,
      v2 = v1 / ratio;
    const volume = (theta) => {
      const rad = (theta * Math.PI) / 180,
        rod = 3.5;
      return (
        v2 + ((v1 - v2) * (1 - Math.cos(rad) + rod - Math.sqrt(rod * rod - Math.sin(rad) ** 2))) / 2
      );
    };
    const compress = adiabat(air, intake.t, v1),
      path = [];
    function mark(angle, v, p, t) {
      path.push([angle, v, p, t]);
    }
    for (let angle = -180; angle < 0; angle += step) {
      const v = volume(angle),
        t = compress(v);
      mark(angle, v, (na * R * t) / v, t);
    }
    const t2 = compress(v2),
      p2 = (na * R * t2) / v2;
    mark(0, v2, p2, t2);
    const h2 = dot(
      air,
      gases.map((_, i) => properties(i, t2)[1]),
    );
    // Open system during admission: fuel enthalpy includes the vaporization energy removed from air.
    const target = h2 + f.hf + intake.q - (diesel ? 0 : na * R * t2);
    const peak = burn(target, totals, diesel ? { p: p2 } : { v: v2 }),
      np = sum(peak.n);
    const v3 = diesel ? (np * R * peak.t) / p2 : v2,
      p3 = (np * R * peak.t) / v3;
    if (v3 >= v1) throw Error("Cutoff exceeds cylinder displacement");
    const cut = diesel ? root((a) => volume(a) - v3, 0, 180, 35, 1e-13) : 0;
    // The ideal Diesel burn follows the isobar to the energy-balanced cutoff.
    if (diesel) {
      for (let angle = step; angle < cut; angle += step) mark(angle, volume(angle), p2, null);
    }
    mark(cut, v3, p3, peak.t);
    const expand = adiabat(peak.n, peak.t, v3);
    for (let angle = (Math.floor(cut / step) + 1) * step; angle < 180; angle += step) {
      const v = volume(angle),
        t = expand(v);
      mark(angle, v, (np * R * t) / v, t);
    }
    const endT = expand(v1);
    mark(180, v1, (np * R * endT) / v1, endT);
    mark(180, v1, P0, intake.t);
    let work = 0;
    for (let i = 1; i < path.length; i++)
      work += ((path[i][1] - path[i - 1][1]) * (path[i][2] + path[i - 1][2])) / 2;
    const eta = work / f.lhv;
    if (!(eta > 0 && eta < 1)) throw Error("Cycle gives an invalid work balance");
    const hot = Object.fromEntries(gases.map((s, i) => [s, peak.n[i]]));
    const result = {
      eta,
      peakBar: p3 / 1e5,
      peakK: peak.t,
      endGasK: t2,
      chargeK: intake.t,
      evapJ: intake.q,
      workJ: work,
      targetJ: target,
      burnResidualJ: peak.residual,
      cutoffDeg: cut,
      hot,
      noPpm: (peak.n[6] / np) * 1e6,
      heatScore: Math.min(100, (100 * peak.t) / 3500),
      knockProxy: t2 / T0,
      lambda,
    };
    if (trace) result.pv = path.map(([deg, v, p, t]) => [deg, (v / (v1 - v2)) * 500, p / 1e5, t]);
    return result;
  }
  function drive(row, vehicle = "Sedan", speed = 110, kind = row.preferred) {
    const [mass, cda, crr] = M.vehicles[vehicle],
      v = speed / 3.6;
    const drag = 0.5 * 1.225 * cda * v * v,
      rolling = mass * 9.80665 * crr;
    const eta = row.cycles[kind].eta * (kind === "Otto" ? 0.64 : 0.72) * 0.91;
    const mjKm = ((drag + rolling) / 1000 + 0.7 / v) / eta;
    const kgKm = mjKm / row.mjKg;
    return {
      range: (50 * row.mjL) / mjKm,
      cost: kgKm * row.usdKg * 100,
      carbon: kgKm * row.exhaust.CO2 * 1000,
      climate: mjKm * row.ci,
      kgKm,
      dragN: drag,
      rollN: rolling,
      mjKm,
      eta,
    };
  }
  function evaluate(parts, reference = false, trace = false, step = 2) {
    const f = inventory(parts, reference),
      n = f.o2 * 3.76;
    const flame = burn(f.hf, [f.atoms.C, f.atoms.H / 2, n, 0], { p: P0 });
    const r = {
      id: Object.keys(parts)
        .sort()
        .map((k) => k + parts[k])
        .join("-"),
      parts,
      name:
        f.keys.length === 1
          ? M.stocks[f.keys[0]].name
          : Object.keys(parts)
              .sort()
              .map((k) => M.stocks[k].short + " " + parts[k])
              .join(" / "),
      preferred: f.cycle,
      atoms: f.atoms,
      mjL: f.lhv / 1e6 / f.volume,
      mjKg: f.lhv / 1e6 / f.mass,
      rho: f.mass / f.volume,
      afr: (f.o2 * gasMass[3] + n * gasMass[2]) / (1000 * f.mass),
      bubbleK: f.bp,
      vaporKpa: f.vapor / 1000,
      flameK: flame.t,
      flameResidualJ: flame.residual,
      hfJ: f.hf,
      lhvJ: f.lhv,
      usdKg: f.cost / f.mass,
      phase: parts.oct === 25 && parts.water === 45 ? "Measured reverse microemulsion" : "Liquid",
      ci: f.lifecycle / (f.lhv / 1e6),
      availability: f.abundance,
      infra: f.infra,
      storage: "Ambient liquid",
      storageComplexity: 1,
      exhaust: {
        CO2: (f.atoms.C * gasMass[0]) / (f.mass * 1000),
        H2O: (f.atoms.H * gasMass[1]) / (2 * f.mass * 1000),
        N2: (n * gasMass[2]) / (f.mass * 1000),
        solidOxides: 0,
      },
      cycles: { Otto: cycle(f, "Otto", trace, step), Diesel: cycle(f, "Diesel", trace, step) },
    };
    Object.assign(r, drive(r));
    return r;
  }
  function score(row, gas) {
    const reward = (x, base) => 1 / (1 + x / base);
    const parts = {
      cost: reward(row.cost, gas.cost),
      abundance: row.availability,
      lifecycle: reward(row.climate, gas.climate),
      no: reward(row.cycles[row.preferred].noPpm, gas.cycles.Otto.noPpm),
      recovery: 0,
      infrastructure: row.infra,
    };
    const index =
      100 *
      (0.35 * parts.cost +
        0.1 * parts.abundance +
        0.3 * parts.lifecycle +
        0.08 * parts.no +
        0.02 * parts.recovery +
        0.15 * parts.infrastructure);
    return { index, scoreParts: parts };
  }
  globalThis.FuelPhysics = { evaluate, drive, score, properties, inventory, validate };
})();
