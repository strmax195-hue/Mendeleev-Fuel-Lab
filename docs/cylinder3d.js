/* Two synchronized viewports share geometry, camera controls and a physical crank clock. */
globalThis.FuelCylinder = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    model = CylinderModel,
    fuel = $("cyl-fuel"),
    kind = $("cyl-cycle"),
    angle = $("cyl-angle"),
    play = $("cyl-play"),
    speed = $("cyl-rpm"),
    layout = $("cyl-layout"),
    flowToggle = $("cyl-tracers"),
    inspect = $("cyl-inspect");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"),
    narrow = matchMedia("(max-width: 620px)");
  const cache = new Map(),
    rigCache = new Map(),
    names = ["candidate", "reference"],
    presets = [...document.querySelectorAll("[data-cyl-view]")];
  let survey,
    bench,
    previousCycle,
    lanes = [],
    scene,
    renderer,
    camera,
    controls,
    rig,
    optics,
    engineKey,
    compactGeometry = false;
  let loading = false,
    visible = false,
    lost = false,
    active = !reduced.matches,
    nowAngle = 10,
    frame = 0,
    lastTick = null;
  let lastDraw = null,
    lastText = 0,
    bucket = 0,
    frames = 0,
    ratio = 1,
    playbackRatio = 1,
    canvasW = 1,
    canvasH = 1,
    dirty = true,
    compiled = false,
    fastLight = false,
    showFlow = true,
    measured = false,
    headroom = 0;
  let transition = null,
    preset = "side",
    halfHeight = 150;
  let T, dir, sideVector, saved, destination, destinationTarget;
  const wrap = (a) => ((((a + 360) % 720) + 720) % 720) - 360;
  const signed = (a) =>
    a === 0 ? "0° TDC" : Math.abs(a).toFixed(1) + "° " + (a < 0 ? "BTDC" : "ATDC");
  const arch = () => (kind.value === "Diesel" ? "diesel" : kind.value === "GDI" ? "gdi" : "mpi");
  const disposal = (root) =>
    root?.traverse((n) => {
      n.geometry?.dispose();
      n.material?.dispose();
    });
  function operating(row, engine, rpm) {
    const k = row.id + "/" + engine + "/" + (rpm === 800 ? "idle" : "load");
    if (!cache.has(k)) {
      if (cache.size >= 32) cache.delete(cache.keys().next().value);
      cache.set(k, model.build(row.parts, engine, rpm));
    }
    return cache.get(k);
  }
  function eventLine(lane) {
    const { op, arch } = lane;
    if (!op.b) return "Motored · ignition quality outside the model domain";
    if (arch === "diesel")
      return (
        "Injection " +
        signed(lane.soi) +
        " · autoignition " +
        signed(op.b.start) +
        " · mixing-controlled"
      );
    return (
      "Spark " +
      signed(op.b.start) +
      " · Sᴸ " +
      op.b.sl.toFixed(2) +
      " m/s · peak LW " +
      op.lw.toFixed(3) +
      (op.onset === null
        ? ""
        : " · knock " +
          signed(op.onset) +
          " · " +
          (lane.acoustic.frequency / 1000).toFixed(1) +
          " kHz")
    );
  }
  function update() {
    if (!bench || !survey) return;
    const candidate =
      fuel.value === "bench" ? bench : survey.results.find((r) => r.id === fuel.value);
    if (!candidate) return;
    const engine = arch(),
      ref = survey.baselines.find((r) => r.id === (engine === "diesel" ? "diesel100" : "ai95100"));
    if (!ref) return;
    const pair = [candidate, ref],
      rpm = Number(speed.value);
    lanes = pair.map((r) => operating(r, engine, rpm));
    pair.forEach((r, i) => {
      $("cyl-" + (i ? "control" : "label")).textContent = r.name + (i ? " · control" : "");
      $("cyl-event-" + names[i]).textContent = eventLine(lanes[i]);
    });
    $("cyl-operating").textContent =
      "Modeled " + lanes[0].rpm.toLocaleString("en") + " rpm · " + 100 * lanes[0].load + "% load";
    const knock = lanes.find((l) => l.op.onset !== null),
      fired = lanes.find((l) => l.op.b);
    inspect.disabled = !fired;
    inspect.textContent = knock ? "Inspect knock" : "Inspect ignition";
    inspect.onclick = () => {
      if (fired) seek(knock ? knock.op.onset : fired.op.b.start);
    };
    if (renderer && engineKey !== engine) setEngine(engine);
    dirty = true;
    drawReadings();
    request();
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
  function drawReadings() {
    if (!lanes.length) return;
    const values = lanes.map((l) => model.sample(l, nowAngle));
    $("cyl-deg").textContent = (Number.isInteger(nowAngle) ? nowAngle : nowAngle.toFixed(1)) + "°";
    angle.value = String(Math.round(nowAngle));
    values.forEach((s, i) => {
      const l = lanes[i],
        knock = l.op.onset !== null && s.knockAge >= 0 && s.knockAge < 0.0045;
      $("cyl-value-" + names[i]).textContent =
        s.phase +
        " · " +
        (s.p / 1e5).toFixed(1) +
        " bar · " +
        Math.round(s.t) +
        " K" +
        (knock ? " · end-gas knock" : "");
      $("cyl-metal-" + names[i]).textContent =
        "Crown " + Math.round(s.crown) + " K · exhaust face " + Math.round(s.valve) + " K";
    });
  }
  function setEngine(key, keepView = false) {
    const compact = active && fastLight;
    if (rig && key === engineKey && compact === compactGeometry) return;
    if (rig) scene.remove(rig.scene, optics.group);
    if (engineKey !== key) {
      for (const entry of rigCache.values()) {
        entry.rig.shadows.dispose();
        disposal(entry.rig.scene);
        disposal(entry.optics.group);
      }
      rigCache.clear();
    }
    compactGeometry = compact;
    engineKey = key;
    if (!rigCache.has(compact)) {
      const hardware = CylinderMechanics.build(T, CYLINDER_INPUTS.engines[key], compact);
      rigCache.set(compact, { rig: hardware, optics: CylinderOptics.build(T, hardware) });
    }
    ({ rig, optics } = rigCache.get(compact));
    scene.add(rig.scene, optics.group);
    if (!keepView) resize();
  }
  const sideBySide = () => layout.value === "pair";
  const viewAspect = () => canvasW / ((sideBySide() ? 2 : 1) * canvasH);
  function frameHeight() {
    return Math.max((rig.camY + 38 - rig.bottom + 17) / 2, (rig.halfWidth + 4) / viewAspect());
  }
  function setPreset(key, instant = false) {
    preset = key;
    presets.forEach((p) => p.setAttribute("aria-pressed", String(p.dataset.cylView === key)));
    if (!camera || !rig) return;
    const close = key === "chamber",
      crank = key === "crank",
      iso = key === "iso",
      aspect = viewAspect();
    const target = new T.Vector3(
      0,
      close ? -12 : crank ? rig.axle + 10 : (rig.camY + 38 + rig.bottom - 17) / 2,
      0,
    );
    const direction = new T.Vector3(
      iso ? 0.8 : crank ? -0.42 : close ? 0.29 : 0.3,
      iso ? 0.43 : close ? 0.19 : 0.17,
      1,
    ).normalize();
    const zoom =
      close || crank
        ? frameHeight() /
          Math.max(crank ? 74 : 43, (crank ? rig.halfWidth : rig.bore / 2 + 6) / aspect)
        : 1;
    const pos = target.clone().addScaledVector(direction, 520);
    if (instant || reduced.matches) {
      transition = null;
      controls.target.copy(target);
      camera.position.copy(pos);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.update();
    } else {
      transition = {
        start: performance.now(),
        from: camera.position.clone(),
        target: controls.target.clone(),
        zoom: camera.zoom,
        to: pos,
        toTarget: target,
        toZoom: zoom,
      };
    }
    dirty = true;
    request();
  }
  function resize() {
    if (!renderer) return;
    const stage = $("cyl-stage");
    canvasW = stage.clientWidth;
    canvasH = stage.clientHeight;
    if (!canvasW || !canvasH) return;
    const aspect = viewAspect();
    halfHeight = rig ? frameHeight() : 160;
    camera.left = -halfHeight * aspect;
    camera.right = -camera.left;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasW, canvasH, false);
    if (preset) setPreset(preset, true);
    dirty = true;
    request();
  }
  const motionPixelLimit = () => Math.min(devicePixelRatio, narrow.matches ? 1.1 : 1.4);
  function graphics() {
    T = globalThis.THREE;
    dir = new T.Vector3();
    sideVector = new T.Vector3();
    saved = new T.Vector3();
    destination = new T.Vector3();
    destinationTarget = new T.Vector3();
    renderer = new T.WebGLRenderer({
      canvas: $("cyl-canvas"),
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0, 0);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    ratio = motionPixelLimit();
    playbackRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setScissorTest(true);
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-100, 100, 150, -150, 0.5, 1600);
    camera.position.set(40, -48, 510);
    controls = new T.OrbitControls(camera, $("cyl-canvas"));
    controls.enableDamping = true;
    controls.dampingFactor = 0.13;
    controls.minZoom = 0.55;
    controls.maxZoom = 7;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI * 0.8;
    controls.rotateSpeed = 0.65;
    controls.panSpeed = 0.75;
    controls.zoomSpeed = 0.8;
    controls.addEventListener("start", () => {
      transition = null;
      preset = null;
      presets.forEach((b) => b.setAttribute("aria-pressed", "false"));
    });
    controls.addEventListener("change", () => {
      dirty = true;
      request();
    });
    setEngine(arch());
    renderer.compile(scene, camera);
    new ResizeObserver(resize).observe($("cyl-stage"));
    $("cyl-canvas").addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      lost = true;
      $("cyl-status").textContent = "WebGL paused · instrument readings active";
    });
    $("cyl-canvas").addEventListener("webglcontextrestored", () => {
      lost = false;
      for (const { rig: hardware } of rigCache.values()) hardware.shadows.invalidate();
      dirty = true;
      $("cyl-status").textContent = "Three.js cutaway · ready";
      request();
    });
    $("cyl-status").textContent = "Three.js cutaway · ready";
    request();
  }
  function view(now) {
    if (!transition) return false;
    const x = Math.min(1, (now - transition.start) / 390),
      s = x * x * (3 - 2 * x),
      tr = transition;
    camera.position.copy(destination.lerpVectors(tr.from, tr.to, s));
    controls.target.copy(destinationTarget.lerpVectors(tr.target, tr.toTarget, s));
    camera.zoom = tr.zoom + (tr.toZoom - tr.zoom) * s;
    camera.updateProjectionMatrix();
    if (x >= 1) transition = null;
    return true;
  }
  function render(advance) {
    if (!renderer || !rig || !lanes.length || lost) return;
    camera.getWorldDirection(dir);
    sideVector.setFromMatrixColumn(camera.matrixWorld, 0);
    saved.copy(camera.position);
    const half = Math.floor(canvasW / 2),
      scale = (canvasH * camera.zoom * ratio) / (2 * halfHeight);
    const pair = sideBySide();
    for (
      let i = layout.value === "reference" ? 1 : 0;
      i < (layout.value === "candidate" ? 1 : 2);
      i++
    ) {
      const lane = lanes[i],
        s = model.sample(lane, nowAngle);
      let shock = s.knockAge >= 0 && s.knockAge < 0.0045 ? s.knockAge : -1;
      // Fast playback can cross the entire transient between two refreshes. Integrate one shutter sample.
      if (
        lane.op.onset !== null &&
        advance > 0 &&
        (nowAngle - lane.op.onset + 720) % 720 < advance &&
        shock < 0
      ) {
        // Light-weighted mean time of the exponentially decaying flash during exposure.
        const lifetime = 0.0045,
          decay = 0.0011;
        shock = decay - lifetime / Math.expm1(lifetime / decay);
      }
      if (shock >= 0 && !reduced.matches) {
        const f = lane.acoustic.frequency;
        camera.position.addScaledVector(
          sideVector,
          0.24 * Math.sin(2 * Math.PI * f * shock) * Math.exp(-shock / 0.001),
        );
        camera.updateMatrixWorld();
      }
      optics.apply(lane, s, nowAngle, dir, scale, shock, showFlow);
      const economise = active && fastLight;
      rig.shadows.uniforms.quickLight.value = economise;
      rig.shadows.render(renderer, nowAngle, economise);
      const left = pair && i ? half : 0,
        width = pair ? (i ? canvasW - half : half) : canvasW;
      renderer.setViewport(left, 0, width, canvasH);
      renderer.setScissor(left, 0, width, canvasH);
      renderer.render(scene, camera);
      camera.position.copy(saved);
      camera.updateMatrixWorld();
    }
    compiled = true;
  }
  function request() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function tick(t) {
    frame = 0;
    if (!visible || document.hidden) return;
    const dt = lastTick === null ? 0 : Math.max(0, t - lastTick);
    lastTick = t;
    const advance = active ? dt * Number(speed.value) * 0.006 : 0;
    if (active) nowAngle = wrap(nowAngle + advance);
    const moving = camera && view(t);
    const damping = controls?.update() || false;
    const movingView = active || moving || damping;
    const stillRatio = Math.min(
      2,
      Math.max(1.6, devicePixelRatio),
      Math.sqrt(4200000 / (canvasW * canvasH)),
    );
    const resolution = movingView ? playbackRatio : stillRatio;
    if (renderer && ratio !== resolution) {
      ratio = resolution;
      renderer.setPixelRatio(ratio);
      dirty = true;
    }
    if (dirty || movingView) {
      const delta = lastDraw === null ? 0 : t - lastDraw;
      render(active && delta ? delta * Number(speed.value) * 0.006 : 0);
      lastDraw = t;
      dirty = false;
      if (t - lastText > 105 || !active) {
        drawReadings();
        lastText = t;
      }
      if (active && compiled && !lost) {
        if (!bucket) {
          bucket = t;
          frames = 0;
        } else frames++;
        if (t - bucket >= (measured ? 1200 : 520)) {
          measured = true;
          const fps = (1000 * frames) / (t - bucket);
          $("cyl-status").textContent = "Three.js cutaway · " + Math.round(fps) + " fps";
          if (fps < 55) {
            fastLight = true;
            headroom = 0;
            const floor = narrow.matches ? 0.5 : 0.42;
            playbackRatio = Math.max(floor, playbackRatio * Math.min(0.88, Math.sqrt(fps / 60)));
            if (!compactGeometry) setEngine(engineKey, true);
          } else if (fps >= 59.4) {
            if (++headroom >= 4) {
              playbackRatio = Math.min(motionPixelLimit(), playbackRatio + 0.04);
              headroom = 0;
            }
          } else headroom = 0;
          frames = 0;
          bucket = t;
        }
      }
    }
    if (!active && moving && !transition) dirty = true;
    if (active || transition || damping || dirty) request();
    else lastTick = null;
  }
  function playback() {
    if (rig) setEngine(engineKey, true);
    lastTick = null;
    lastDraw = null;
    bucket = 0;
    frames = 0;
    dirty = true;
    if (renderer && !lost)
      $("cyl-status").textContent = active
        ? "Three.js cutaway · playing"
        : "Three.js cutaway · paused";
    play.textContent = active ? "Pause cycle" : "Play cycle";
    play.setAttribute("aria-pressed", String(active));
    request();
  }
  function seek(a) {
    active = false;
    nowAngle = a;
    playback();
    drawReadings();
  }
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }
  async function load() {
    if (loading) return;
    loading = true;
    try {
      await Promise.all([
        loadScript("vendor/three.min.js").then(() => loadScript("vendor/OrbitControls.js")),
        loadScript("cylinder-studio.js"),
        loadScript("cylinder-mechanics.js"),
        loadScript("cylinder-optics.js"),
      ]);
      graphics();
    } catch {
      if (renderer) {
        renderer.dispose();
        renderer = null;
      }
      $("cyl-status").textContent = "3D graphics unavailable · crank-angle instruments active";
    }
  }
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (!visible && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (visible) load();
    playback();
  }).observe($("cyl-stage"));
  document.addEventListener("visibilitychange", playback);
  reduced.addEventListener("change", (e) => {
    if (e.matches) {
      active = false;
      playback();
    }
  });
  play.onclick = () => {
    active = !active;
    playback();
  };
  angle.oninput = () => seek(Number(angle.value));
  speed.onchange = () => {
    update();
    playback();
  };
  fuel.onchange = kind.onchange = update;
  flowToggle.onclick = () => {
    showFlow = !showFlow;
    flowToggle.setAttribute("aria-pressed", String(showFlow));
    dirty = true;
    request();
  };
  layout.onchange = () => {
    $("cyl-stage").dataset.layout = layout.value;
    $("cyl-label").hidden = layout.value === "reference";
    $("cyl-control").hidden = layout.value === "candidate";
    resize();
  };
  const viewer = $("cyl-viewer"),
    expand = $("cyl-fullscreen");
  if (document.fullscreenEnabled && viewer.requestFullscreen) {
    expand.hidden = false;
    expand.onclick = async () => {
      try {
        if (document.fullscreenElement === viewer) await document.exitFullscreen();
        else await viewer.requestFullscreen();
      } catch {
        $("cyl-status").textContent = "Full screen unavailable in this browser";
      }
    };
    document.addEventListener("fullscreenchange", () => {
      expand.textContent =
        document.fullscreenElement === viewer ? "Exit full screen" : "Full screen";
      resize();
    });
  }
  for (const p of presets) p.onclick = () => setPreset(p.dataset.cylView);
  $("cyl-canvas").onkeydown = (e) => {
    if (!controls) return;
    const k = e.key;
    if (k === "+" || k === "=" || k === "-") {
      e.preventDefault();
      camera.zoom = Math.max(
        controls.minZoom,
        Math.min(controls.maxZoom, camera.zoom * (k === "-" ? 0.86 : 1.16)),
      );
      camera.updateProjectionMatrix();
      dirty = true;
      request();
    } else if (k === "Home") {
      e.preventDefault();
      setPreset("side");
    }
  };
  return {
    catalogue,
    bench(row, cycle) {
      bench = row;
      if (fuel.value === "bench" && cycle !== previousCycle) kind.value = cycle;
      previousCycle = cycle;
      update();
    },
  };
})();
