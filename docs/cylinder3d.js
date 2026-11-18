/* Reduced-order cutaway, synchronized on crank angle. All thermochemistry is evaluated before animation. */
globalThis.FuelCylinder = (() => {
  const el = (id) => document.getElementById(id);
  const fuel = el("cyl-fuel"),
    kind = el("cyl-cycle"),
    angle = el("cyl-angle"),
    button = el("cyl-play");
  const M = globalThis.FUEL_MODEL,
    F = globalThis.FuelPhysics,
    rpm = 2000;
  const strokeM = 0.086,
    boreM = Math.sqrt((4 * 0.0005) / (Math.PI * strokeM));
  const top = 1.68,
    stroke = 1.55,
    rod = (3.5 * stroke) / 2,
    rad = Math.PI / 180;
  const refs = {},
    cache = new Map();
  let survey,
    bench,
    lanes = [],
    scene,
    camera,
    renderer,
    groups,
    renderPending,
    installed = false;
  let visible = false,
    active = !matchMedia("(prefers-reduced-motion: reduce)").matches,
    angleNow = 10,
    previous = 0,
    lastText = 0,
    nextFrame = 0,
    sampleStart = 0,
    frames = 0;
  const frameBudget = 1000 / 60;
  const mass = (s) => Object.entries(s.atoms).reduce((m, [e, n]) => m + n * M.weights[e], 0);
  function prepare(r, cycle) {
    const c = r.cycles[cycle],
      trace = c.pv;
    const stocks = Object.entries(r.parts).map(([k, n]) => [
      k,
      n * mass(M.stocks[k]),
      M.stocks[k].rho,
    ]);
    const burning = stocks.filter(([k]) => k !== "water");
    const vol = burning.reduce((s, [, m, rho]) => s + m / rho, 0);
    const base = burning.every(([k]) => M.laminarMps[k] != null)
      ? burning.reduce((s, [k, m, rho]) => s + (M.laminarMps[k] * m) / rho, 0) / vol
      : null;
    const wet =
      (stocks.find(([k]) => k === "water")?.[1] || 0) / stocks.reduce((s, [, m]) => s + m, 0);
    // Use compressed unburned gas at ignition. The ideal-cycle trace has its SI heat step at TDC.
    const p = trace.find((v) => v[0] === 0)[2],
      phi = 1 / c.lambda;
    const sl =
      cycle === "Otto" && base !== null && phi >= 0.65 && phi <= 1.45
        ? ((base * (1 - 2.4 * (phi - 1.08) ** 2)) / (1 - 2.4 * 0.08 ** 2)) *
          (c.endGasK / 298.15) ** (2.18 - 0.8 * (phi - 1)) *
          (p / 1.01325) ** (-0.16 + 0.22 * (phi - 1)) *
          Math.exp(-2.2 * wet)
        : null;
    const turbulent =
      sl === null ? null : sl + 0.9 * ((2 * strokeM * rpm) / 60) * Math.sqrt(sl / 0.65);
    return { name: r.name, c, trace, cycle, ratio: cycle === "Diesel" ? 17 : 10.5, sl, turbulent };
  }
  function displacement(a) {
    const s = Math.sin(a * rad);
    return (1 - Math.cos(a * rad) + 3.5 - Math.sqrt(3.5 ** 2 - s * s)) / 2;
  }
  function sample(lane, a) {
    const { trace, c, cycle, ratio } = lane,
      piston = displacement(a),
      vol = 500 * (1 / (ratio - 1) + piston);
    if (a < -180 || a >= 180)
      return {
        v: vol,
        p: 1.01325,
        t: a < -180 ? c.chargeK : null,
        radial: 0,
        phase: a < -180 ? "intake" : "exhaust",
        piston,
      };
    let lo = 0,
      hi = trace.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (trace[mid][0] <= a) lo = mid;
      else hi = mid;
    }
    const l = trace[lo],
      h = trace[hi],
      f = h[0] === l[0] ? 0 : (a - l[0]) / (h[0] - l[0]);
    const between = (i) => l[i] + (h[i] - l[i]) * f;
    // Diesel cutoff temperatures between the endpoints are unreported in the underlying trace.
    const t = l[3] == null || h[3] == null ? (a === l[0] ? l[3] : null) : between(3);
    const diesel = cycle === "Diesel",
      cutoff = c.cutoffDeg;
    const radius =
      a < 0
        ? 0
        : diesel
          ? Math.cbrt(
              Math.min(
                1,
                Math.max(0, (between(1) - 500 / (ratio - 1)) / (500 * displacement(cutoff))),
              ),
            )
          : lane.turbulent === null
            ? 0
            : Math.min(1, (lane.turbulent * a) / (6 * rpm) / (boreM / 2));
    return {
      p: between(2),
      t,
      v: between(1),
      piston,
      radial: radius,
      phase: a < 0 ? "compression" : diesel && a < cutoff ? "injection / combustion" : "expansion",
    };
  }
  function catalogue(s) {
    survey = s;
    const old = fuel.value;
    fuel.replaceChildren(
      new Option("Current blend laboratory", "bench"),
      ...s.results.map((r) => new Option(r.name, r.id)),
    );
    fuel.value = [...fuel.options].some((o) => o.value === old) ? old : "bench";
    if (bench) update();
  }
  function update() {
    if (!bench || !survey) return;
    let r = bench;
    if (fuel.value !== "bench") {
      const row = survey.results.find((v) => v.id === fuel.value);
      if (!row) return;
      if (!cache.has(row.id)) cache.set(row.id, F.evaluate(row.parts, false, true));
      r = cache.get(row.id);
    }
    const cy = kind.value,
      ref = cy === "Diesel" ? "diesel" : "ai95";
    refs[ref] ||= F.evaluate({ [ref]: 100 }, true, true);
    lanes = [prepare(r, cy), prepare(refs[ref], cy)];
    el("cyl-label").textContent = r.name;
    el("cyl-control").textContent = refs[ref].name + " · control";
    render(0, true);
  }
  function setup(T) {
    renderer = new T.WebGLRenderer({
      canvas: el("cyl-canvas"),
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x14241f);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-3, 3, 2.3, -2.3, 0.1, 30);
    camera.position.set(0, 1.7, 10);
    camera.lookAt(0, -0.52, 0);
    const hemi = new T.HemisphereLight(0xecffdc, 0x536960, 2.2);
    scene.add(hemi);
    const light = new T.DirectionalLight(0xffe8c7, 3.1);
    light.position.set(-2, 4, 5);
    scene.add(light);
    const rim = new T.DirectionalLight(0x9ccbc1, 2);
    rim.position.set(2, 1, -3);
    scene.add(rim);
    const mat = (color, roughness = 0.45) =>
      new T.MeshStandardMaterial({ color, metalness: 0.5, roughness });
    const steel = mat(0x97aaa4),
      dark = mat(0x334a43),
      bronze = mat(0xb49c6a);
    function rig(x) {
      const group = new T.Group();
      group.position.x = x;
      scene.add(group);
      function mesh(g, m, parent = group) {
        const o = new T.Mesh(g, m);
        parent.add(o);
        return o;
      }
      function cyl(r, h, m, y, parent = group) {
        const o = mesh(new T.CylinderGeometry(r, r, h, 40), m, parent);
        o.position.y = y;
        return o;
      }
      const wall = new T.MeshStandardMaterial({
        color: 0x6e8d80,
        side: T.DoubleSide,
        roughness: 0.5,
        metalness: 0.46,
      });
      const shell = mesh(
        new T.CylinderGeometry(0.82, 0.82, 2.38, 44, 1, true, 0.35 * Math.PI, 1.3 * Math.PI),
        wall,
      );
      shell.position.y = 0.53;
      for (const y of [-0.63, -0.54, 1.58, 1.7]) {
        const lip = mesh(
          new T.CylinderGeometry(0.88, 0.88, 0.075, 44, 1, true, 0.35 * Math.PI, 1.3 * Math.PI),
          steel,
        );
        lip.position.y = y;
      }
      const piston = new T.Group();
      group.add(piston);
      cyl(0.75, 0.35, steel, -0.185, piston);
      for (const y of [-0.06, -0.13, -0.27]) cyl(0.76, 0.028, dark, y, piston);
      const pin = mesh(new T.CylinderGeometry(0.1, 0.1, 1.45, 20), bronze, piston);
      pin.rotation.x = Math.PI / 2;
      pin.position.y = -0.21;
      const link = mesh(new T.CylinderGeometry(0.12, 0.09, 1, 12), bronze);
      const crank = mesh(new T.CylinderGeometry(0.45, 0.45, 0.17, 32), dark);
      crank.rotation.x = Math.PI / 2;
      crank.position.z = -0.2;
      const web = mesh(new T.BoxGeometry(0.24, stroke / 2, 0.16), steel);
      const journal = mesh(new T.CylinderGeometry(0.14, 0.14, 0.46, 20), bronze);
      journal.rotation.x = Math.PI / 2;
      const shaft = mesh(new T.CylinderGeometry(0.15, 0.15, 0.46, 20), steel);
      shaft.rotation.x = Math.PI / 2;
      const jet = mesh(
        new T.ConeGeometry(0.31, 0.75, 16, 1, true),
        new T.MeshBasicMaterial({
          color: 0x82c9dd,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          wireframe: true,
        }),
      );
      jet.position.set(-0.22, top - 0.36, 0);
      const nozzle = cyl(0.055, 0.27, steel, top + 0.03);
      nozzle.position.x = -0.22;
      const spark = cyl(0.047, 0.24, bronze, top + 0.06);
      spark.position.x = 0.08;
      const glow = mesh(
        new T.CylinderGeometry(0.72, 0.72, 1, 36),
        new T.MeshBasicMaterial({
          color: 0xffa645,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      const wave = mesh(
        new T.SphereGeometry(1, 32, 16),
        new T.MeshBasicMaterial({
          color: 0xffba60,
          wireframe: true,
          transparent: true,
          opacity: 0.68,
          depthWrite: false,
        }),
      );
      return {
        group,
        piston,
        link,
        crank,
        web,
        journal,
        shaft,
        jet,
        glow,
        wave,
        vec: new T.Vector3(),
        axis: new T.Vector3(0, 1, 0),
      };
    }
    groups = [rig(-1.45), rig(1.45)];
    function resize() {
      const c = el("cyl-stage"),
        w = c.clientWidth,
        h = c.clientHeight;
      if (!w || !h) return;
      const aspect = w / h,
        half = Math.max(2.55, 2.68 / aspect);
      camera.left = -half * aspect;
      camera.right = half * aspect;
      groups[0].group.position.x = camera.left / 2;
      groups[1].group.position.x = camera.right / 2;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      render(0, true);
    }
    new ResizeObserver(resize).observe(el("cyl-stage"));
    resize();
  }
  function pose(r, v, data, a) {
    const clearance = stroke / (data.ratio - 1),
      height = (stroke * v.v) / 500;
    r.piston.position.y = top - height;
    const pinY = r.piston.position.y - 0.21,
      axle = top - clearance - 0.21 - stroke / 2 - rod;
    const cx = (Math.sin(a * rad) * stroke) / 2,
      cy = axle + (Math.cos(a * rad) * stroke) / 2;
    r.link.position.set(cx / 2, (pinY + cy) / 2, 0);
    r.vec.set(-cx, pinY - cy, 0);
    r.link.scale.y = r.vec.length();
    r.link.quaternion.setFromUnitVectors(r.axis, r.vec.normalize());
    r.crank.position.y = axle;
    r.shaft.position.set(0, axle, -0.1);
    r.web.position.set(cx / 2, (axle + cy) / 2, -0.12);
    r.web.rotation.z = -a * rad;
    r.journal.position.set(cx, cy, -0.03);
    r.jet.visible =
      (data.cycle === "Otto" && a >= -350 && a < -200) ||
      (data.cycle === "Diesel" && a >= 0 && a < data.c.cutoffDeg);
    r.jet.scale.y = Math.min(1, height / 0.75);
    r.jet.position.y = top - 0.37 * r.jet.scale.y;
    r.glow.scale.y = height;
    r.glow.position.y = top - height / 2;
    const heat = v.t === null ? 0 : Math.min(1, Math.max(0, (v.t - 550) / 2100));
    r.glow.material.opacity = heat * 0.32;
    r.glow.material.color.setHSL(0.025 + 0.095 * heat, 0.9, 0.34 + 0.25 * heat);
    const radius = 0.73 * v.radial;
    r.wave.visible = radius > 0 && a < (data.cycle === "Diesel" ? data.c.cutoffDeg + 14 : 62);
    r.wave.scale.set(radius, Math.min(radius, height / 2), radius);
    r.wave.position.y = top - Math.min(radius, height / 2);
  }
  function render(t = 0, force = false) {
    if (!lanes.length) return;
    const values = lanes.map((l) => sample(l, angleNow));
    if (renderer && groups && (visible || force)) {
      groups.forEach((r, i) => pose(r, values[i], lanes[i], angleNow));
      renderer.render(scene, camera);
    }
    if (force || t - lastText > 110) {
      lastText = t;
      angle.value = Math.round(angleNow);
      el("cyl-deg").textContent = Math.round(angleNow) + "°";
      el("cyl-values").textContent = lanes
        .map((l, i) => {
          const v = values[i];
          return (
            l.name +
            " · " +
            v.phase +
            " · " +
            v.p.toFixed(1) +
            " bar · " +
            (v.t === null ? "T unreported" : Math.round(v.t) + " K") +
            " · " +
            (l.cycle === "Diesel"
              ? "mixing-controlled"
              : l.sl === null
                ? "flame speed unresolved"
                : "Sᴸ " + l.sl.toFixed(2) + " m/s")
          );
        })
        .join("   |   ");
    }
  }
  function tick(t) {
    renderPending = null;
    if (!visible || !active || document.hidden) return;
    if (previous) angleNow = ((angleNow + 360 + Math.min(t - previous, 80) * 0.105) % 720) - 360;
    previous = t;
    if (t + 0.8 >= nextFrame) {
      nextFrame = Math.max(t, nextFrame || t) + frameBudget;
      render(t);
      if (renderer && groups) {
        if (!sampleStart) sampleStart = t;
        else frames++;
        if (t - sampleStart >= 1200) {
          const fps = (frames * 1000) / (t - sampleStart);
          el("cyl-status").textContent =
            "Three.js cutaway · " + Math.round(fps) + " fps · 60 fps target";
          if (fps < 48 && renderer.getPixelRatio() > 0.6)
            renderer.setPixelRatio(Math.max(0.6, renderer.getPixelRatio() * 0.8));
          sampleStart = t;
          frames = 0;
        }
      }
    }
    renderPending = requestAnimationFrame(tick);
  }
  function schedule() {
    if (renderPending) cancelAnimationFrame(renderPending);
    renderPending = null;
    previous = 0;
    nextFrame = 0;
    sampleStart = 0;
    frames = 0;
    button.textContent = active ? "Pause cycle" : "Play cycle";
    button.setAttribute("aria-pressed", String(active));
    if (visible && active && !document.hidden) renderPending = requestAnimationFrame(tick);
  }
  function load() {
    if (installed) return;
    installed = true;
    const script = document.createElement("script");
    script.src = "vendor/three.min.js";
    script.onload = () => {
      try {
        setup(globalThis.THREE);
        el("cyl-status").textContent = "Three.js cutaway · synchronized crank angle";
      } catch {
        el("cyl-status").textContent =
          "WebGL unavailable on this device. The numerical trace and angle control remain available.";
      }
      schedule();
    };
    script.onerror = () => {
      el("cyl-status").textContent =
        "3D renderer unavailable. The numerical indicator remains active.";
    };
    document.head.append(script);
  }
  new IntersectionObserver((items) => {
    visible = items[0].isIntersecting;
    if (visible) load();
    schedule();
  }).observe(el("cyl-stage"));
  document.addEventListener("visibilitychange", schedule);
  button.onclick = () => {
    active = !active;
    schedule();
  };
  angle.oninput = () => {
    active = false;
    angleNow = Number(angle.value);
    schedule();
    render(0, true);
  };
  fuel.onchange = update;
  kind.onchange = update;
  return {
    catalogue,
    bench(row, cycle) {
      bench = row;
      if (fuel.value === "bench") kind.value = cycle;
      update();
    },
  };
})();
