/* Browser calculations run headlessly against the same data used on Pages. */
const assert = require("node:assert/strict");
for (const script of [
  "model",
  "thermo",
  "cylinder-inputs",
  "cylinder-model",
  "cylinder-mechanics",
  "cylinder-optics",
]) {
  require("../docs/" + script + ".js");
}
const M = CylinderModel;
function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " vs " + expected);
}

function geometry() {
  for (const [name, open, close] of [
    ["intake", 345, 570],
    ["exhaust", 135, 370],
  ]) {
    const mid = (open + close) / 2;
    near(M.lift(name, mid), 0.008);
    for (const a of [open - 10, open, close, close + 10, mid + 360]) near(M.lift(name, a), 0);
    for (const a of [open + 10, mid, close - 10]) {
      assert.ok(M.lift(name, a) > 0);
      near(M.lift(name, a - 720), M.lift(name, a));
    }
    for (let a = -360; a <= 360; a += 5) {
      const phi = (a * Math.PI) / 360 - Math.PI / 2;
      const xy = (t) => CylinderMechanics.camPoint(name, t);
      const point = xy(phi),
        left = xy(phi - 1e-5),
        right = xy(phi + 1e-5);
      const pitch = 14 + 1000 * M.lift(name, a);
      const dx = pitch * Math.cos(phi) - point[0],
        dy = pitch * Math.sin(phi) - point[1];
      near(Math.hypot(dx, dy), 3);
      const tx = right[0] - left[0],
        ty = right[1] - left[1];
      near((tx * dx + ty * dy) / Math.hypot(tx, ty), 0, 2e-5);
    }
  }
  let overlap = 0;
  for (let a = 0.5; a < 720; a++)
    overlap += Number(M.lift("intake", a) > 0 && M.lift("exhaust", a) > 0);
  assert.equal(overlap, 25);
  for (const engine of Object.values(CYLINDER_INPUTS.engines)) {
    const crank = engine.stroke / 2,
      rod = 3.5 * crank;
    for (let a = -360; a <= 360; a += 5) {
      const r = (a * Math.PI) / 180;
      const pinX = crank * Math.sin(r),
        pinY = crank * Math.cos(r);
      const wristY = crank + rod - engine.stroke * M.travel(a);
      near(Math.hypot(wristY - pinY, pinX), rod);
    }
    near(M.volume(engine, 180) / M.volume(engine, 0), engine.cr);
  }
}

function combustion() {
  const mpi = M.build({ ai95: 100 }, "mpi", 2000),
    gdi = M.build({ ai95: 100 }, "gdi", 2000);
  const slow = M.build({ ai95: 100 }, "mpi", 60),
    idle = M.build({ ai95: 100 }, "mpi", 800);
  assert.deepEqual(mpi.grid, slow.grid);
  assert.equal(idle.rpm, 800);
  assert.equal(idle.load, 0.2);
  const sample = (a) => M.sample(mpi, a);
  const start = mpi.op.b.start;
  near(sample(start - 1).flameM, 0);
  near(sample(start).flameM, 0);
  near(sample(start + 12).flameM, (mpi.op.b.sl * 12) / (6 * mpi.rpm));
  near(sample(135).flameM, 0);
  assert.ok(mpi.op.lw < 1 && mpi.op.onset === null);
  assert.ok(gdi.op.lw > 1 && gdi.op.onset > 0);
  assert.ok(M.sample(gdi, gdi.op.onset - 0.001).knockAge < 0);
  near(M.sample(gdi, gdi.op.onset).knockAge, 0);
  assert.ok(M.sample(gdi, gdi.op.onset + 0.001).knockAge > 0);
  const diesel = M.build({ b100: 100 }, "diesel", 2000);
  assert.ok(diesel.op.b.lag > 0 && diesel.soi < diesel.op.b.start);
  near(diesel.op.b.start - diesel.soi, diesel.op.b.lag);
  assert.equal(diesel.op.onset, null);
  assert.equal(diesel.op.b.sl, null);
  const motored = M.build({ eth: 100 }, "diesel", 800);
  assert.equal(motored.op.b, null);
  assert.equal(M.sample(motored, 10).flameM, 0);
  assert.throws(() => M.build({ dme: 100 }, "mpi", 2000), /registered liquids/);
  assert.throws(() => M.build({ water: 21, eth: 79 }, "mpi", 2000), /20 mol%/);
  for (const lane of [mpi, gdi, idle, diesel, motored]) {
    assert.ok(
      lane.grid.every((q) =>
        [q.t, q.p, q.crown, q.valve].every((v) => Number.isFinite(v) && v > 0),
      ),
    );
    assert.ok(Math.abs(lane.openResidualJ) < 1e-3, "Open-cylinder first-law residual in joules");
    for (const key of ["t", "p", "crown", "valve"])
      near(lane.grid[0][key], lane.grid[720][key], 1e-6);
    for (let a = 180; a <= 360; a++) assert.match(M.sample(lane, a).phase, /exhaust/);
  }
  assert.ok(sample(135).p > sample(180).p && sample(135).t > sample(180).t);
  assert.ok(sample(180).t > sample(360).t);
  assert.notEqual(sample(0).crown, sample(180).crown);
  assert.notEqual(sample(0).valve, sample(180).valve);
  const oxygenate = CylinderOptics.flameColor(2150, 0),
    sooting = CylinderOptics.flameColor(2150, 1);
  assert.ok(oxygenate[2] > oxygenate[0] && sooting[0] > sooting[2]);
  assert.ok(CylinderOptics.blackbody(3000)[2] > CylinderOptics.blackbody(1700)[2]);
}

function animatedParts() {
  const T = require("../docs/vendor/three.min.js");
  const view = new T.Vector3(0, 0, -1);
  for (const [arch, parts] of [
    ["gdi", { ai95: 100 }],
    ["diesel", { b100: 100 }],
  ]) {
    const lane = M.build(parts, arch, 2000);
    const rig = CylinderMechanics.build(T, lane.e, true);
    const effects = CylinderOptics.build(T, rig);
    const hardware = rig.scene.children.find((mesh) => mesh.material.uniforms.joints);
    const joints = hardware.material.uniforms.joints.value;
    const flame = effects.group.children.find((node) => node.isMesh);
    const spray = effects.group.children.find((node) => node.isPoints);
    function pose(a) {
      const state = M.sample(lane, a);
      const shock = state.knockAge >= 0 && state.knockAge < 0.0045 ? state.knockAge : -1;
      effects.apply(lane, state, a, view, 1, shock);
      return state;
    }
    for (const angle of [-281, -170, 0, 98, 270, 360]) {
      const s = pose(angle);
      const wrist = new T.Vector3(0, -16, 0).applyMatrix4(joints[1]);
      const rodTip = new T.Vector3(0, (3.5 * rig.stroke) / 2, 0).applyMatrix4(joints[2]);
      near(wrist.distanceTo(rodTip), 0);
      near(joints[4].elements[13], -1000 * s.intake);
      near(joints[5].elements[13], -1000 * s.exhaust);
    }
    pose(lane.soi + 0.1);
    assert.ok(spray.visible && !flame.visible);
    pose(lane.op.b.start - 0.001);
    assert.equal(flame.visible, false);
    pose(lane.op.b.start);
    assert.equal(flame.visible, true);
    const u = flame.material.uniforms;
    if (arch === "gdi") {
      near(u.sparkAge.value, 0);
      pose(lane.op.b.start + 10);
      near(u.radius.value, (1000 * lane.op.b.sl * 10) / (6 * lane.rpm));
      pose(lane.op.onset);
      near(u.knock.value, 0);
      near(u.frequency.value, (1.841 * u.sound.value) / (Math.PI * lane.bore));
      assert.ok(u.frequency.value > 1000);
    } else {
      near(u.sparkAge.value, -1);
      near(u.diesel.value, 1);
      pose(45);
      assert.ok(u.burned.value > 0);
      assert.equal(lane.acoustic, null);
    }
  }
}

if (process.argv[2] === "geometry") geometry();
else if (process.argv[2] === "combustion") combustion();
else if (process.argv[2] === "rig") animatedParts();
else {
  const cases = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  const outputs = cases.map(({ parts, arch, mode }) => {
    const lane = M.build(parts, arch, mode),
      { op } = lane;
    return {
      rho: lane.s.rho,
      dose: lane.s.dose,
      advance: op.advance,
      start: op.b?.start,
      lw: op.lw,
      onset: op.onset,
      sl: op.b?.sl,
      lag: op.b?.lag,
      peak: op.peakBar,
      pulse: op.x.pulse,
    };
  });
  process.stdout.write(JSON.stringify(outputs));
}
