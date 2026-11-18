/* Crank degrees are relative to firing TDC. SI units except where indicated. */
globalThis.CylinderModel = (() => {
  "use strict";
  const I = CYLINDER_INPUTS,
    M = FUEL_MODEL,
    ATM = 101325,
    R = 287.05,
    gamma = 1.35;
  const rad = Math.PI / 180,
    clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const wrap = (a) => ((a % 720) + 720) % 720;
  // Firing TDC = 0; gas-exchange TDC = 360. Intake opens 15 degrees before gas-exchange TDC.
  const valves = {
    intake: { open: 345, close: 570, lift: 0.008, diameter: 0.033 },
    exhaust: { open: 135, close: 370, lift: 0.008, diameter: 0.03 },
  };
  function lift(which, angle) {
    const e = valves[which],
      progress = wrap(angle - e.open) / (e.close - e.open);
    return progress >= 1 ? 0 : e.lift * Math.sin(Math.PI * progress) ** 2;
  }
  function travel(deg) {
    const a = deg * rad;
    return (1 - Math.cos(a) + 3.5 - Math.sqrt(3.5 ** 2 - Math.sin(a) ** 2)) / 2;
  }
  const volume = (e, a) => e.litres * 0.00025 * (1 / (e.cr - 1) + travel(a));
  function fuel(parts) {
    FuelPhysics.validate(parts, true);
    const mass = {},
      vol = {};
    let total = 0;
    for (const [k, x] of Object.entries(parts)) {
      const s = M.stocks[k];
      mass[k] = Object.entries(s.atoms).reduce((a, [el, n]) => a + n * M.weights[el], 0) / 1000;
      vol[k] = (x * mass[k]) / s.rho;
      total += vol[k];
    }
    for (const k in vol) vol[k] /= total;
    let dose = 0;
    if (Object.keys(vol).every((k) => k === "eth" || k === "ipa")) {
      const dry = Object.entries(vol).reduce((v, [k, x]) => v + x * I.wear[k], 0);
      if (dry > I.wearLimit)
        dose =
          I.doses.find(
            (d) => I.wear.b100 + (dry - I.wear.b100) * Math.exp(-d / 0.013) <= I.wearLimit,
          ) || 0;
    }
    if (dose) {
      for (const k in vol) vol[k] *= 1 - dose;
      vol.b100 = dose;
      mass.b100 =
        Object.entries(M.stocks.b100.atoms).reduce((a, [el, n]) => a + n * M.weights[el], 0) / 1000;
    }
    const atoms = { C: 0, H: 0, O: 0 };
    let rho = 0,
      heat = 0,
      latent = 0;
    for (const [k, v] of Object.entries(vol)) {
      const s = M.stocks[k],
        kg = v * s.rho,
        n = kg / mass[k];
      rho += kg;
      latent += n * s.latent;
      for (const el in atoms) atoms[el] += n * (s.atoms[el] || 0);
      heat +=
        n * (s.hf - (s.atoms.C || 0) * M.cea.CO2.hf_j_mol - (s.atoms.H / 2) * M.cea.H2O.hf_j_mol);
    }
    function quality(i) {
      let weighted = 0,
        known = 0;
      for (const [k, v] of Object.entries(vol))
        if (k !== "water" && I.quality[k][i] != null) {
          weighted += v * I.quality[k][i];
          known += v;
        }
      return known >= (1 - (vol.water || 0)) * (0.98 - 1e-12) ? weighted / known : null;
    }
    return {
      rho,
      lhv: heat / rho,
      latent: latent / rho,
      water: ((vol.water || 0) * M.stocks.water.rho) / rho,
      afr:
        ((atoms.C + atoms.H / 4 - atoms.O / 2) *
          (M.cea.O2.molar_mass + 3.76 * M.cea.N2.molar_mass)) /
        1000 /
        rho,
      ron: quality(0),
      cn: quality(1),
      sl: quality(2),
      dose,
      soot: Math.min(
        1,
        (vol.ai95 || 0) + (vol.diesel || 0) + 0.82 * (vol.b100 || 0) + 0.18 * (vol.oct || 0),
      ),
    };
  }
  // Match the pressure, temperature and effective injector flow of the Stage 3 cell.
  function inlet(s, e, load) {
    const diesel = e.ref === "diesel";
    const wide = e.gauge_bar ? ATM + 1e5 * e.gauge_bar : 0.98 * ATM;
    const p = diesel ? ATM + 1e5 * e.gauge_bar * load : 0.25 * ATM + (wide - 0.25 * ATM) * load;
    const lam = diesel ? 1.4 / load ** 0.65 : 1;
    const after = 302 * (1 + (0.3 * (Math.max(1, p / ATM) ** 0.286 - 1)) / 0.72);
    const t = Math.max(
      250,
      after - ((diesel ? 0 : e.gauge_bar ? 0.45 : 0.27) * s.latent) / (1006 * s.afr * lam),
    );
    const air = (p * e.litres * 0.00025 * 0.92) / (R * t),
      fuelMass = air / (s.afr * lam);
    const pulse = (fuelMass * 1e6) / (e.flow_mg_ms * Math.sqrt(s.rho / M.stocks[e.ref].rho));
    return { p, t, lam, after, air, heat: fuelMass * s.lhv, pulse };
  }
  function siRate(t, p, ron) {
    return 1 / (0.01768 * (ron / 100) ** 3.402 * (p / ATM) ** -1.7 * Math.exp(3800 / t));
  }
  function ciRate(t, p, cn, rpm, e) {
    if (p / 1e5 <= 12.4) return 0;
    const log =
      (618840 / (cn + 25)) * (1 / (8.31446 * t) - 1 / 17190) + (21.2 / (p / 1e5 - 12.4)) ** 0.63;
    return (6 * rpm * Math.exp(-log)) / (0.36 + (0.22 * 2 * e.stroke * rpm) / 60);
  }
  // Integrate dt/tau and locate the exact crossing by inverting a linear-rate trapezoid.
  function integrate(a, b, r0, r1, sum, rpm) {
    const dt = (b - a) / (6 * rpm),
      next = sum + (dt * (r0 + r1)) / 2;
    let onset = null;
    if (sum < 1 && next >= 1) {
      const target = (1 - sum) / dt;
      onset =
        a +
        ((b - a) * 2 * target) / (r0 + Math.sqrt(Math.max(0, r0 * r0 + 2 * (r1 - r0) * target)));
    }
    return [next, onset];
  }
  function burn(s, e, rpm, advance, inlet) {
    const { t, p, lam, pulse } = inlet,
      start = -advance,
      v0 = volume(e, -150);
    if (e.ref === "diesel") {
      if (s.cn == null || s.cn < 20) return null;
      const rate = (a) => {
        const v = v0 / volume(e, a);
        return ciRate(t * v ** 0.35, p * v ** gamma, s.cn, rpm, e);
      };
      let a = start,
        r0 = rate(a),
        sum = 0;
      for (let b = 2 * (Math.floor(a / 2) + 1); b <= 48; b += 2) {
        const r1 = rate(b),
          [next, onset] = integrate(a, b, r0, r1, sum, rpm);
        if (onset !== null)
          return {
            start: onset,
            span: Math.max(12, pulse * 0.006 * rpm + 10),
            sl: null,
            lag: onset - start,
          };
        a = b;
        r0 = r1;
        sum = next;
      }
      return null;
    }
    if (s.sl == null || s.ron == null) return null;
    const ratio = v0 / volume(e, start),
      phi = 1 / lam;
    const shape = (1 - 2.4 * (phi - 1.08) ** 2) / (1 - 2.4 * 0.08 ** 2);
    const sl =
      s.sl *
      shape *
      ((t * ratio ** 0.35) / 298.15) ** (2.18 - 0.8 * (phi - 1)) *
      ((p * ratio ** gamma) / ATM) ** (-0.16 + 0.22 * (phi - 1)) *
      Math.exp(-2.2 * s.water);
    const turbulent = sl + ((0.9 * 2 * e.stroke * rpm) / 60) * Math.sqrt(sl / 0.65);
    return {
      start,
      span: (6 * rpm * 0.48 * Math.sqrt((e.litres * 0.001) / (Math.PI * e.stroke))) / turbulent,
      sl,
      lag: null,
    };
  }
  const frac = (a, b) =>
    b ? -Math.expm1(-4.60517 * clamp((a - b.start) / b.span, 0, 1) ** 3) / 0.99 : 0;
  const fractionAngle = (b, x) => b.start + b.span * (-Math.log(1 - 0.99 * x) / 4.60517) ** (1 / 3);
  function cell(s, e, rpm, x, advance, save = false, motored = false) {
    const b = motored ? null : burn(s, e, rpm, advance, x);
    if (!b && !motored) return null;
    const diesel = e.ref === "diesel",
      v0 = volume(e, -150),
      cap = b ? fractionAngle(b, 0.98) : -150;
    const grid = [];
    let p = x.p,
      v = v0,
      burnt = 0,
      work = 0,
      peak = p,
      lw = 0,
      onset = null;
    let r0 = b && !diesel ? siRate(x.t, p, s.ron) : 0;
    if (save) grid.push({ a: -150, p, t: x.t, xb: 0, lw: 0 });
    for (let a = -148; a <= 150; a += 2) {
      const vn = volume(e, a),
        vm = Math.sqrt(vn * v),
        xb = frac(a, b);
      const pn =
        p * (v / vn) ** gamma +
        (((gamma - 1) * 0.89 * x.heat * (xb - burnt)) / vm) * (vm / vn) ** gamma;
      if (!diesel && a - 2 < cap) {
        const end = Math.min(cap, a),
          pe = p + ((pn - p) * (end - a + 2)) / 2,
          tu = x.t * (pe / x.p) ** ((gamma - 1) / gamma);
        const r1 = siRate(tu, pe, s.ron),
          [next, cross] = integrate(a - 2, end, r0, r1, lw, rpm);
        if (cross !== null) onset = cross;
        lw = next;
        r0 = r1;
      }
      if (save) grid.push({ a, p: pn, t: (x.t * pn * vn) / (x.p * v0), xb, lw });
      work += ((p + pn) / 2) * (vn - v);
      p = pn;
      v = vn;
      burnt = xb;
      peak = Math.max(peak, p);
    }
    const swept = e.litres * 0.00025,
      brake = work - (Math.max(ATM, x.p) * 1.04 - x.p + (0.65 + 0.00012 * rpm) * 1e5) * swept;
    const delivered = Math.min(1, e.injection_window / (x.pulse * 0.006 * rpm));
    const violations = [
      !diesel && lw >= 1,
      diesel && b && (b.lag > 25 || b.start > 12),
      b && fractionAngle(b, 0.9) > 45,
      peak / 1e5 > e.peak_limit_bar,
      delivered < 1,
      !diesel && delivered / x.lam < 0.75,
      brake <= 0,
    ].filter(Boolean).length;
    const score = [
      Number(violations > 0),
      violations,
      Math.max(0, lw - 1),
      b ? Math.abs(fractionAngle(b, 0.5) - 8) : Infinity,
      -Math.max(0, brake / x.heat),
    ];
    return { advance, b, score, grid, lw: diesel || !b ? null : lw, onset, peakBar: peak / 1e5 };
  }
  function operating(s, e, rpm, load) {
    const x = inlet(s, e, load),
      diesel = e.ref === "diesel";
    let timings = [];
    if (diesel) timings = Array.from({ length: 14 }, (_, i) => 2 * i + 2);
    else {
      const initial = burn(s, e, rpm, 12, x);
      if (initial) {
        // Python's round() uses ties to even for this two-degree timing grid.
        const target = (initial.span * 0.53 - 8) / 2,
          lower = Math.floor(target);
        const ideal =
          2 * (target - lower === 0.5 ? lower + (Math.abs(lower) % 2) : Math.round(target));
        const candidates = [0, 2, 4, -2, -4, -6, -8, -12, -16].map((offset) =>
          clamp(ideal + offset, -4, 36),
        );
        timings = [...new Set([...candidates, 0, -2, -4])];
      }
    }
    let best = null;
    for (const a of timings) {
      const c = cell(s, e, rpm, x, a);
      if (!c) continue;
      const i = best ? c.score.findIndex((v, j) => v !== best.score[j]) : -1;
      if (!best || (i >= 0 && c.score[i] < best.score[i])) best = c;
    }
    return { x, ...cell(s, e, rpm, x, best?.advance ?? 0, true, !best) };
  }
  // Bidirectional quasi-steady nozzle with choking. Positive kg/s leaves the cylinder.
  function flow(p, t, portP, portT, area) {
    const out = p >= portP,
      up = Math.max(p, portP),
      q = Math.max(Math.min(p, portP) / up, (2 / (gamma + 1)) ** (gamma / (gamma - 1)));
    return (
      (out ? 1 : -1) *
      0.65 *
      area *
      up *
      Math.sqrt(
        (((2 * gamma) / (gamma - 1)) * q ** (2 / gamma) * (1 - q ** ((gamma - 1) / gamma))) /
          (R * (out ? t : portT)),
      )
    );
  }
  // State integrates T, gas mass, piston work, wall heat and signed port enthalpy in SI units.
  function exchange(e, op, rpm, first) {
    const cv = R / (gamma - 1),
      cp = cv + R,
      bore = Math.sqrt((e.litres * 0.001) / (Math.PI * e.stroke));
    const face = (Math.PI * bore * bore) / 4,
      sec = 1 / (6 * rpm),
      ve = valves.exhaust,
      vi = valves.intake;
    const portT = first.t * Math.min(1, ATM / first.p) ** ((gamma - 1) / gamma);
    const aperture = (v, l) => Math.PI * v.diameter * Math.min(v.diameter / 4, l);
    function rates(a, s) {
      const [t, m] = s,
        v = volume(e, a),
        p = (m * R * t) / v,
        th = a * rad;
      const dv =
        e.litres *
        0.000125 *
        rad *
        Math.sin(th) *
        (1 + Math.cos(th) / Math.sqrt(3.5 ** 2 - Math.sin(th) ** 2));
      const ex = sec * flow(p, t, ATM, portT, aperture(ve, lift("exhaust", a)));
      const air = sec * flow(p, t, op.x.p, op.x.t, aperture(vi, lift("intake", a)));
      const h =
        130 * v ** -0.06 * (p / 1e5) ** 0.8 * t ** -0.4 * ((2 * e.stroke * rpm) / 60 + 1.4) ** 0.8;
      const wall = sec * h * (2 * face + (4 * v) / bore) * (t - 450),
        work = p * dv;
      const hFlow = cp * (ex * (ex >= 0 ? t : portT) + air * (air >= 0 ? t : op.x.t));
      return [
        (-work - wall - hFlow + cv * t * (ex + air)) / (m * cv),
        -ex - air,
        work,
        wall,
        hFlow,
      ];
    }
    const initial = (first.p * volume(e, 135)) / (R * first.t),
      dt = 0.25;
    let state = [first.t, initial, 0, 0, 0];
    const grid = [];
    const shift = (k, h) => state.map((v, i) => v + h * k[i]);
    for (let a = 135; a <= 570; a += dt) {
      if (Number.isInteger(a))
        grid.push({
          a,
          p: (state[1] * R * state[0]) / volume(e, a),
          t: state[0],
          xb: a <= 370 && op.b ? 1 : 0,
          lw: a <= 370 ? op.lw || 0 : 0,
        });
      if (a === 570) break;
      const k1 = rates(a, state),
        k2 = rates(a + dt / 2, shift(k1, dt / 2)),
        k3 = rates(a + dt / 2, shift(k2, dt / 2)),
        k4 = rates(a + dt, shift(k3, dt));
      state = state.map((v, i) => v + (dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6);
    }
    return {
      grid,
      residualJ: initial * cv * first.t - state[1] * cv * state[0] - state[2] - state[3] - state[4],
    };
  }
  function blendPoint(a, l, r) {
    const w = (a - l.a) / (r.a - l.a || 1);
    return {
      a,
      p: l.p + (r.p - l.p) * w,
      t: l.t + (r.t - l.t) * w,
      xb: l.xb + (r.xb - l.xb) * w,
      lw: l.lw + (r.lw - l.lw) * w,
    };
  }
  // Solve the periodic, lumped metal energy balance exactly for each constant one-degree interval.
  function metal(grid, rpm, valve) {
    const terms = [];
    let A = 1,
      B = 0;
    for (const q of grid.slice(0, 720)) {
      const lifted = lift("exhaust", q.a) / valves.exhaust.lift;
      const h = valve ? 275 + 600 * lifted : 410,
        sink = valve ? 495 - 310 * lifted : 855;
      const bulk = valve ? 420 : 365,
        capacity = valve ? 7800 * 500 * 0.002 : 2700 * 900 * 0.002;
      const decay = Math.exp(-(h + sink) / (6 * rpm * capacity)),
        add = ((h * q.t + sink * bulk) / (h + sink)) * (1 - decay);
      terms.push([decay, add]);
      A *= decay;
      B = B * decay + add;
    }
    let t = B / (1 - A);
    const result = [t];
    for (const [d, b] of terms) {
      t = t * d + b;
      result.push(t);
    }
    return result;
  }
  function build(parts, arch, mode) {
    const e = I.engines[arch],
      s = fuel(parts),
      rpm = mode === 800 ? 800 : 2000,
      load = mode === 800 ? 0.2 : 1;
    const op = operating(s, e, rpm, load);
    const closed = (a) => {
      const j = clamp(Math.floor((a + 150) / 2), 0, op.grid.length - 2);
      return blendPoint(a, op.grid[j], op.grid[j + 1]);
    };
    const open = exchange(e, op, rpm, closed(135)),
      grid = [];
    for (let a = -360; a <= 360; a++) {
      const q = a < -150 ? open.grid[a + 720 - 135] : a < 135 ? closed(a) : open.grid[a - 135];
      grid.push({ ...q, a });
    }
    const crown = metal(grid, rpm, false),
      valve = metal(grid, rpm, true);
    grid.forEach((q, i) => {
      q.crown = crown[i];
      q.valve = valve[i];
    });
    const diesel = e.ref === "diesel",
      direct = arch === "gdi" || diesel;
    const pulse = op.x.pulse * 0.006 * rpm;
    // MPI pulse is centred at maximum intake lift. GDI injects at 75 degrees into intake.
    const soi = diesel ? (op.b ? -op.advance : null) : direct ? -285 : -360 + 97.5 - pulse / 2;
    const bore = Math.sqrt((e.litres * 0.001) / (Math.PI * e.stroke));
    let acoustic = null;
    if (op.onset !== null) {
      const sound = Math.sqrt(gamma * R * closed(op.onset).t);
      acoustic = { sound, frequency: (1.841 * sound) / (Math.PI * bore) };
    }
    return {
      arch,
      e,
      s,
      rpm,
      load,
      grid,
      op,
      soi,
      pulse,
      bore,
      acoustic,
      cooling: diesel ? s.latent / (1006 * s.afr * op.x.lam) : op.x.after - op.x.t,
      openResidualJ: open.residualJ,
    };
  }
  function sample(lane, angle) {
    const i = clamp(Math.floor(angle) + 360, 0, 719),
      l = lane.grid[i],
      r = lane.grid[i + 1],
      w = clamp(angle - l.a, 0, 1);
    const q = blendPoint(angle, l, r),
      op = lane.op,
      age = op.b ? (angle - op.b.start) / (6 * lane.rpm) : -1;
    const knockAge = op.onset === null ? -1 : (angle - op.onset) / (6 * lane.rpm);
    return {
      ...q,
      crown: l.crown + (r.crown - l.crown) * w,
      valve: l.valve + (r.valve - l.valve) * w,
      piston: lane.e.stroke * (1 / (lane.e.cr - 1) + travel(angle)),
      intake: lift("intake", angle),
      exhaust: lift("exhaust", angle),
      flameM: op.b?.sl && age >= 0 && angle < 135 ? op.b.sl * age : 0,
      age,
      knockAge,
      phase:
        angle >= 135 || angle <= -350
          ? "exhaust / gas exchange"
          : angle < -150
            ? "intake"
            : !op.b
              ? "motored"
              : angle < op.b.start
                ? "compression"
                : angle < op.b.start + op.b.span
                  ? "combustion"
                  : "expansion",
    };
  }
  return { valves, lift, travel, volume, fuel, operating, integrate, build, sample };
})();
