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
    const synthesis = weighted((s) => (s.synthesisMjKg * mw(s.atoms)) / 1000);
    const solarInput = terms.every(([s]) => s.solarRoute)
      ? weighted((s) => {
          const massKg = mw(s.atoms) / 1000;
          const process = (s.synthesisMjKg * massKg) / M.solar.process;
          if (s.solarRoute === "treatment") return process;
          const heat =
            (s.hf - s.atoms.C * M.cea.CO2.hf_j_mol - (s.atoms.H / 2) * M.cea.H2O.hf_j_mol) / 1e6;
          return process + heat / (M.solar.crop * M.solar.recovery);
        })
      : null;
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
      synthesis,
      solarInput,
      lifecycle,
      abundance,
      infra: 0.4 + 0.6 * weighted((s) => s.infra),
      cycle: keys.length === 1 ? M.stocks[keys[0]].cycle : "Otto",
    };
  }
  function environmentalBaselines(f) {
    const organic = f.terms
      .filter(([s]) => s.screenDt50Days)
      .map(([s, x]) => [x * mw(s.atoms), s.screenDt50Days]);
    function halfLife(i) {
      const target = sum(organic.map(([m]) => m)) / 2;
      let lo = Math.min(...organic.map(([, d]) => d[i])),
        hi = Math.max(...organic.map(([, d]) => d[i]));
      for (let j = 0; j < 50; j++) {
        const mid = (lo + hi) / 2;
        if (sum(organic.map(([m, d]) => m * 2 ** (-mid / d[i]))) > target) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    const sunlight = sum(f.terms.map(([s, x]) => x * s.comparisonSolarMjMol));
    return {
      solarPct: (100 * f.lhv) / 1e6 / sunlight,
      routes: [...new Set(f.terms.map(([s]) => s.comparisonRoute))].sort(),
      soilDays: halfLife(0),
      waterDays: halfLife(1),
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
  // Frozen composition in a 0.5 L cylinder with a bidirectional exhaust poppet.
  function exhaustStroke(products, endT, v1, v2, volume) {
    const np = sum(products),
      frac = products.map((n) => n / np);
    const fit = mixtureCoefficients(frac),
      molarKg = dot(frac, gasMass) / 1000;
    const props = (t) => raw(fit[Number(t >= 1000)], t);
    const scale = 0.0005 / (v1 - v2),
      actualV = (deg) => volume(deg) * scale;
    const initialMol = np * scale,
      pEnd = (initialMol * R * endT) / actualV(180);
    // A frozen isentropic expansion to the manifold estimates the return-gas boundary.
    const sEnd = props(endT)[2];
    const portK = root(
      (t) => props(t)[2] - sEnd - R * Math.log(P0 / pEnd),
      200,
      endT,
      endT * 0.8,
      1e-9,
    );
    const rpm = 2000,
      wallK = 450,
      stroke = 0.086,
      valveM = 0.03,
      liftM = 0.008,
      cd = 0.65;
    const area = 0.0005 / stroke,
      bore = Math.sqrt((4 * area) / Math.PI);
    const rad = Math.PI / 180,
      speed = (2 * stroke * rpm) / 60,
      secPerDeg = 1 / (6 * rpm);
    const u = (t) => props(t)[1] - R * t;

    // State = temperature, moles, boundary work, wall heat, signed flow enthalpy,
    // gross expelled moles and gross returned moles. All fluxes are per crank degree.
    function rates(angle, state) {
      const [t, n] = state,
        a = rad * angle,
        v = actualV(angle);
      const dv =
        0.00025 * rad * Math.sin(a) * (1 + Math.cos(a) / Math.sqrt(3.5 ** 2 - Math.sin(a) ** 2));
      const p = (n * R * t) / v,
        gas = props(t),
        out = p >= P0;
      const upK = out ? t : portK,
        up = out ? gas : props(portK);
      const gamma = up[0] / (up[0] - R);
      const pressureRatio = Math.max(
        Math.min(p, P0) / Math.max(p, P0),
        (2 / (gamma + 1)) ** (gamma / (gamma - 1)),
      );
      const flowFactor = Math.sqrt(
        Math.max(
          0,
          ((2 * gamma) / (gamma - 1)) *
            pressureRatio ** (2 / gamma) *
            (1 - pressureRatio ** ((gamma - 1) / gamma)),
        ),
      );
      const lift = liftM * Math.max(0, Math.sin((angle - 180) * rad));
      const opening = Math.PI * valveM * Math.min(valveM / 4, lift);
      const flow =
        ((out ? 1 : -1) * cd * opening * Math.max(p, P0) * flowFactor * secPerDeg) /
        Math.sqrt(R * molarKg * upK);
      // Hohenberg (SAE 790825), V in m³, pressure in bar, mean piston speed in m/s.
      const h = 130 * v ** -0.06 * (p / 1e5) ** 0.8 * t ** -0.4 * (speed + 1.4) ** 0.8;
      const wall = h * (2 * area + (Math.PI * bore * v) / area) * (t - wallK) * secPerDeg;
      const work = p * dv;
      return [
        (-work - wall - flow * (up[1] - (gas[1] - R * t))) / (n * (gas[0] - R)),
        -flow,
        work,
        wall,
        flow * up[1],
        Math.max(0, flow),
        Math.max(0, -flow),
      ];
    }
    let state = [endT, initialMol, 0, 0, 0, 0, 0];
    const path = [[180, actualV(180) * 1e6, pEnd / 1e5, endT, initialMol]];
    const dt = 0.25,
      shift = (k, d) => state.map((x, i) => x + d * k[i]);
    for (let angle = 180; angle < 360; angle += dt) {
      const k1 = rates(angle, state),
        k2 = rates(angle + dt / 2, shift(k1, dt / 2));
      const k3 = rates(angle + dt / 2, shift(k2, dt / 2)),
        k4 = rates(angle + dt, shift(k3, dt));
      state = state.map((x, i) => x + (dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6);
      if (Number.isInteger(angle + dt)) {
        const v = actualV(angle + dt),
          [t, n] = state;
        path.push([angle + dt, v * 1e6, (n * R * t) / v / 1e5, t, n]);
      }
    }
    const [t, n, workJ, wallJ, outflowEnthalpyJ, expelledMol, returnedMol] = state;
    return {
      path,
      rpm,
      wallK,
      portK,
      preReleaseK: endT,
      preReleaseBar: pEnd / 1e5,
      initialMol,
      remainingMol: n,
      expelledMol,
      returnedMol,
      wallJ,
      workJ,
      outflowEnthalpyJ,
      energyResidualJ: initialMol * u(endT) - n * u(t) - workJ - wallJ - outflowEnthalpyJ,
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
    if (trace) {
      result.pv = path.map(([deg, v, p, t]) => [deg, (v / (v1 - v2)) * 500, p / 1e5, t]);
      result.exhaust = exhaustStroke(peak.n, endT, v1, v2, volume);
    }
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
      synthesisMj100: kgKm * row.synthesisMjKg * 100,
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
      synthesisMjKg: f.synthesis / f.mass,
      netEnergyReturn: f.lhv / 1e6 / f.synthesis,
      baselines: environmentalBaselines(f),
      solarToTankPct: f.solarInput === null ? null : (100 * f.lhv) / 1e6 / f.solarInput,
      elementPpm: Object.fromEntries(
        M.elements
          .filter((e) => f.atoms[e.symbol] > 0)
          .map((e) => [e.symbol, { crust: e.ppm, air: e.airPpm, ocean: e.oceanPpm }]),
      ),
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
      energy: row.netEnergyReturn / (row.netEnergyReturn + gas.netEnergyReturn),
      abundance: row.availability,
      lifecycle: reward(row.climate, gas.climate),
      no: reward(row.cycles[row.preferred].noPpm, gas.cycles.Otto.noPpm),
      recovery: 0,
      infrastructure: row.infra,
    };
    const index =
      100 *
      (0.35 * parts.energy +
        0.1 * parts.abundance +
        0.3 * parts.lifecycle +
        0.08 * parts.no +
        0.02 * parts.recovery +
        0.15 * parts.infrastructure);
    return { index, scoreParts: parts };
  }
  globalThis.FuelPhysics = { evaluate, drive, score, properties, inventory, validate };
})();
