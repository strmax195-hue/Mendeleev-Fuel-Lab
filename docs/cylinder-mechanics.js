/* Millimetre-scale rigid bodies. All opaque parts share one indexed PBR draw. */
globalThis.CylinderMechanics = (() => {
  const rad = Math.PI / 180,
    turn = 2 * Math.PI;
  // Pitch curve of a translating roller follower, offset by its radius along the true normal.
  function camPoint(which, angle, base = 11, roller = 3) {
    const radius = (a) =>
      base + roller + 1000 * CylinderModel.lift(which, (2 * (a + Math.PI / 2)) / rad);
    const r = radius(angle),
      dr = (radius(angle + 0.00001) - radius(angle - 0.00001)) / 0.00002;
    const c = Math.cos(angle),
      s = Math.sin(angle),
      length = Math.hypot(r, dr);
    return [
      r * c - (roller * (r * c + dr * s)) / length,
      r * s - (roller * (r * s - dr * c)) / length,
    ];
  }
  function build(T, engine, compact = false) {
    const rings = compact ? 24 : 64,
      springSteps = compact ? 55 : 110,
      camSteps = compact ? 48 : 144;
    const scene = new T.Group(),
      positions = [],
      normals = [],
      colors = [],
      joints = [],
      surfaces = [],
      indices = [];
    const transforms = Array.from({ length: 8 }, () => new T.Matrix4());
    const stroke = 1000 * engine.stroke,
      bore = 1000 * Math.sqrt((engine.litres * 0.001) / (Math.PI * engine.stroke)),
      radius = bore / 2;
    const crankR = stroke / 2,
      rod = 3.5 * crankR,
      clearance = stroke / (engine.cr - 1),
      pinOffset = 16;
    const axle = -clearance - pinOffset - crankR - rod,
      camY = 49,
      valveX = radius * 0.48;
    const steel = [0xc1c9cd, 0.24, 0.91],
      satin = [0xb0b7bd, 0.34, 0.86],
      graphite = [0x56616c, 0.35, 0.78],
      casting = [0x45545c, 0.62, 0.64],
      bronze = [0xcd9853, 0.29, 0.84],
      bright = [0xdde4e2, 0.19, 0.9],
      ceramic = [0xf6ede0, 0.24, 0.04],
      black = [0x252f33, 0.5, 0.45],
      hotMetal = [0xad8469, 0.36, 0.8],
      intakeWall = [0x55767d, 0.39, 0.7],
      section = [0xbb916f, 0.43, 0.77];
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      origin = new T.Vector3(),
      one = new T.Vector3(1, 1, 1);
    // Joint 0 case, 1 piston, 2 rod, 3 crank, 4/5 intake/exhaust and 6/7 cams.
    function add(
      g,
      style,
      j = 0,
      x = 0,
      y = 0,
      z = 0,
      rx = 0,
      ry = 0,
      rz = 0,
      hot = 0,
      flex = null,
    ) {
      m.compose(origin.set(x, y, z), q.setFromEuler(new T.Euler(rx, ry, rz)), one);
      g.applyMatrix4(m);
      const v = g.attributes.position,
        n = g.attributes.normal,
        c = new T.Color(style[0]),
        base = positions.length / 3;
      // Three's extruded solids repeat vertices for each triangle. Neither casting
      // UVs nor face groups are used; weld coincident vertices with matching normals.
      const unique = g.index ? null : new Map();
      for (let i = 0; i < v.count; i++) {
        if (unique) {
          const key = [v.getX(i), v.getY(i), v.getZ(i), n.getX(i), n.getY(i), n.getZ(i)]
            .map((x) => Math.round(x * 100000))
            .join("/");
          const existing = unique.get(key);
          if (existing !== undefined) {
            indices.push(existing);
            continue;
          }
          const index = positions.length / 3;
          unique.set(key, index);
          indices.push(index);
        }
        positions.push(v.getX(i), v.getY(i), v.getZ(i));
        normals.push(n.getX(i), n.getY(i), n.getZ(i));
        colors.push(c.r, c.g, c.b);
        joints.push(j);
        surfaces.push(style[1], style[2], style === section ? 3 : hot, flex ? flex(v.getY(i)) : 1);
      }
      if (g.index) for (const i of g.index.array) indices.push(base + i);

      g.dispose();
    }
    const cylinder = (r, h, style, j, x, y, z, rx = 0, segments = compact ? 12 : 24) =>
      add(new T.CylinderGeometry(r, r, h, segments), style, j, x, y, z, rx);
    function lathe(
      profile,
      style,
      j = 0,
      x = 0,
      y = 0,
      z = 0,
      hot = 0,
      start = 0,
      arc = turn,
      segments = rings,
    ) {
      add(
        new T.LatheGeometry(
          profile.map(([r, h]) => new T.Vector2(r, h)),
          segments,
          start,
          arc,
        ),
        style,
        j,
        x,
        y,
        z,
        0,
        0,
        0,
        hot,
      );
    }
    function plate(points, depth, style, j, x, y, z) {
      const shape = new T.Shape();
      points.forEach(([a, b], i) => (i ? shape.lineTo(a, b) : shape.moveTo(a, b)));
      shape.closePath();
      const bevel = !compact && (j === 2 || j === 3) ? Math.min(0.7, depth * 0.12) : 0;
      add(
        new T.ExtrudeGeometry(shape, {
          depth: depth - 2 * bevel,
          bevelEnabled: bevel > 0,
          bevelSize: bevel,
          bevelThickness: bevel,
          bevelSegments: 2,
          curveSegments: 16,
        }),
        style,
        j,
        x,
        y,
        z - depth / 2 + bevel,
      );
    }
    function eye(outer, inner, depth, style, j, x, y, z) {
      const half = depth / 2;
      const bevel = compact ? 0 : Math.min(0.48, (outer - inner) * 0.15, depth * 0.16);
      const segments = compact ? (outer > 12 ? 22 : 14) : outer > 12 ? 64 : 36;
      // Revolve the true bore profile. Split adjacent faces for sharp chamfers;
      // analytic radial normals keep each polished journal continuous around its axis.
      const profile = bevel
        ? [
            [inner, -half + bevel],
            [inner + bevel, -half],
            [outer - bevel, -half],
            [outer, -half + bevel],
            [outer, half - bevel],
            [outer - bevel, half],
            [inner + bevel, half],
            [inner, half - bevel],
          ]
        : [
            [inner, -half],
            [outer, -half],
            [outer, half],
            [inner, half],
          ];
      const xyz = [],
        normals = [],
        indices = [];
      for (let i = 0; i < profile.length; i++) {
        const a = profile[i],
          b = profile[(i + 1) % profile.length];
        const dr = b[0] - a[0],
          dz = b[1] - a[1],
          length = Math.hypot(dr, dz);
        const base = xyz.length / 3;
        for (let k = 0; k < segments; k++) {
          const angle = (k * turn) / segments,
            c = Math.cos(angle),
            s = Math.sin(angle);
          for (const [r, h] of [a, b]) {
            xyz.push(r * c, r * s, h);
            normals.push((dz * c) / length, (dz * s) / length, -dr / length);
          }
          const k0 = base + 2 * k,
            k1 = base + 2 * ((k + 1) % segments);
          indices.push(k0, k1, k0 + 1, k1, k1 + 1, k0 + 1);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(xyz, 3));
      g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
      g.setIndex(indices);
      add(g, style, j, x, y, z);
    }
    const wallStart = 0.31 * Math.PI,
      wallArc = 1.38 * Math.PI;
    // A swept, hollow port with a longitudinal inspection cut. Outer and inner walls
    // share the centreline. Both lips, the flange and the terminal bore have real thickness.
    const runners = [];
    function port(side, throat) {
      const sx = side * valveX,
        mouth = radius + 24,
        spans = 10;
      const curve = new T.CubicBezierCurve3(
        new T.Vector3(sx, 1, -1),
        new T.Vector3(sx, 15, -2),
        new T.Vector3(side * (mouth - 15), 23, -6),
        new T.Vector3(side * mouth, 23, -6),
      );
      const angles = compact ? 14 : 32;
      const volume = [0];
      for (let k = 1; k <= spans; k++) {
        const a = (k - 1) / spans,
          b = k / spans;
        const length = curve.getPoint(a).distanceTo(curve.getPoint(b));
        const ra = throat * (0.78 + 0.18 * a),
          rb = throat * (0.78 + 0.18 * b);
        volume.push(volume[k - 1] + (Math.PI * length * (ra * ra + ra * rb + rb * rb)) / 3);
      }
      function wall(outside) {
        const pos = [],
          ids = [];
        for (let k = 0; k <= spans; k++) {
          const u = k / spans,
            p = curve.getPoint(u),
            tangent = curve.getTangent(u);
          const normal = new T.Vector3().crossVectors(new T.Vector3(0, 0, 1), tangent).normalize();
          const binormal = new T.Vector3().crossVectors(tangent, normal);
          const r = throat * (0.78 + 0.18 * u) + (outside ? 2.3 : 0);
          for (let i = 0; i <= angles; i++) {
            const a = Math.PI * (0.84 + (1.32 * i) / angles);
            const v = p
              .clone()
              .addScaledVector(normal, r * Math.cos(a))
              .addScaledVector(binormal, r * Math.sin(a));
            pos.push(v.x, v.y, v.z);
            if (k && i) {
              const d = k * (angles + 1) + i,
                c = d - 1,
                b = d - angles - 1,
                a = b - 1;
              if (outside) ids.push(a, b, c, b, d, c);
              else ids.push(a, c, b, b, c, d);
            }
          }
        }
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
        g.setIndex(ids);
        g.computeVertexNormals();
        if (!outside) {
          // Lift the tracer sheet slightly into the passage to avoid depth fighting.
          const sheet = g.clone(),
            coords = [],
            xyz = sheet.attributes.position,
            n = sheet.attributes.normal;
          for (let k = 0; k <= spans; k++)
            for (let i = 0; i <= angles; i++) {
              const j = k * (angles + 1) + i;
              xyz.setXYZ(
                j,
                xyz.getX(j) + 0.28 * n.getX(j),
                xyz.getY(j) + 0.28 * n.getY(j),
                xyz.getZ(j) + 0.28 * n.getZ(j),
              );
              coords.push(volume[k] / volume[spans], i / angles);
            }
          sheet.setAttribute("uv", new T.Float32BufferAttribute(coords, 2));
          runners.push({ geometry: sheet, volumeM3: volume[spans] * 1e-9 });
        }
        add(g, outside ? casting : side < 0 ? intakeWall : hotMetal);
        return pos;
      }
      const outer = wall(true),
        inner = wall(false);
      const cap = [],
        vertex = (arr, i) => cap.push(arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]);
      function rim(i, j, flip) {
        if (flip) [i, j] = [j, i];
        vertex(outer, i);
        vertex(inner, i);
        vertex(outer, j);
        vertex(inner, i);
        vertex(inner, j);
        vertex(outer, j);
      }
      for (let k = 0; k < spans; k++) {
        const a = k * (angles + 1),
          b = a + angles + 1;
        rim(a, b, true);
        rim(a + angles, b + angles, false);
      }
      for (let i = 0; i < angles; i++) {
        rim(i, i + 1, false);
        const a = spans * (angles + 1) + i;
        rim(a, a + 1, true);
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(cap, 3));
      g.computeVertexNormals();
      add(g, section);
      // A bolted flange in the YZ plane with the passage bored through it.
      const face = new T.Shape(),
        r = throat * 0.96;
      face.absellipse(0, 0, r + 9, r + 4, 0, turn, false, 0);
      const hole = new T.Path();
      hole.absarc(0, 0, r, 0, turn, true);
      face.holes.push(hole);
      for (const z of [-1, 1]) {
        const bolt = new T.Path();
        bolt.absarc(z * (r + 5), 0, 1.6, 0, turn, true);
        face.holes.push(bolt);
      }
      const flange = new T.ExtrudeGeometry(face, {
        depth: 3,
        bevelEnabled: !compact,
        bevelThickness: 0.45,
        bevelSize: 0.5,
        bevelSegments: 1,
        curveSegments: compact ? 6 : 12,
      });
      add(flange, satin, 0, side * mouth, 23, -6, 0, (side * Math.PI) / 2);
    }
    // Rear casting, bearing bulkhead and cut-away inspection rails. The window is
    // bored out of the casting so the connecting rod remains visible through both sides.
    const top = -stroke - 5,
      bottom = axle - crankR - 12,
      hw = radius + 9;
    const castingShape = new T.Shape();
    castingShape.moveTo(-hw, top);
    castingShape.lineTo(hw, top);
    castingShape.bezierCurveTo(hw - 4, top - 25, hw - 16, axle + 52, hw - 5, axle + 31);
    castingShape.quadraticCurveTo(hw + 16, axle, hw - 1, axle - 32);
    castingShape.lineTo(hw - 13, bottom + 8);
    castingShape.lineTo(-hw + 13, bottom + 8);
    castingShape.lineTo(-hw + 1, axle - 32);
    castingShape.quadraticCurveTo(-hw - 16, axle, -hw + 5, axle + 31);
    castingShape.bezierCurveTo(-hw + 16, axle + 52, -hw + 4, top - 25, -hw, top);
    const window = new T.Path(),
      wh = hw - 14;
    window.moveTo(-wh, top - 12);
    window.quadraticCurveTo(0, top - 8, wh, top - 12);
    window.bezierCurveTo(wh - 1, top - 36, wh - 12, axle + 47, wh - 5, axle + 31);
    window.quadraticCurveTo(0, axle + 19, -wh + 5, axle + 31);
    window.bezierCurveTo(-wh + 12, axle + 47, -wh + 1, top - 36, -wh, top - 12);
    castingShape.holes.push(window);
    const bearingHole = new T.Path();
    bearingHole.absarc(0, axle, 15, 0, turn, true);
    castingShape.holes.push(bearingHole);
    add(
      new T.ExtrudeGeometry(castingShape, {
        depth: 9,
        bevelEnabled: !compact,
        bevelThickness: 1.4,
        bevelSize: 1.4,
        bevelSegments: 1,
        curveSegments: compact ? 6 : 12,
      }),
      casting,
      0,
      0,
      0,
      -34,
    );
    eye(21, 13.8, 10, casting, 0, 0, axle, -21);
    eye(15, 9, 11, bronze, 0, 0, axle, -19);
    for (const side of [-1, 1]) {
      const profile = [
        [hw - 10, top],
        [hw + 1, top],
        [hw - 8, top - 28],
        [hw - 13, axle + 50],
        [hw + 3, axle + 22],
        [hw + 5, axle - 14],
        [hw - 3, axle - 35],
        [hw - 17, bottom + 5],
        [hw - 24, bottom + 5],
        [hw - 9, axle - 34],
        [hw - 3, axle - 13],
        [hw - 5, axle + 19],
        [hw - 20, axle + 50],
        [hw - 14, top - 27],
      ].map(([x, y]) => [side * x, y]);
      plate(profile, 29, casting, 0, 0, 0, -12);
      plate(profile, 0.9, section, 0, 0, 0, 3);
      // Cast-in ribs carry the main-bearing loads to the skirt and sump flange.
      for (const [x, y] of [
        [hw - 8, axle + 28],
        [hw - 10, axle - 30],
      ]) {
        const root = side * 14,
          tip = side * x;
        plate(
          [
            [root, axle - 1.7],
            [tip, y - 3.2],
            [tip, y + 3.2],
            [root, axle + 1.7],
          ],
          5,
          casting,
          0,
          0,
          0,
          -21.2,
        );
      }
      const foot = side * (hw - 9);
      add(new T.BoxGeometry(31, 6, 44), satin, 0, foot, bottom, -13);
      for (const y of [top - 5, axle + 19, axle - 17]) {
        const x = side * (y === top - 5 ? hw - 5 : hw);
        cylinder(3.9, 3, steel, 0, x, y, 4.3, Math.PI / 2, 12);
        cylinder(2.9, 2.2, graphite, 0, x, y, 6.4, Math.PI / 2, 6);
      }
      for (const y of [0, 2.7])
        add(new T.BoxGeometry(13, 1.1, 16), graphite, 0, foot, bottom + 3.3 + y, -11);
    }
    const pan = [
      [-hw + 3, axle - 33],
      [-hw + 13, bottom + 1],
      [hw - 13, bottom + 1],
      [hw - 3, axle - 33],
      [hw - 10, axle - 33],
      [hw - 18, bottom + 7],
      [-hw + 18, bottom + 7],
      [-hw + 10, axle - 33],
    ];
    plate(pan, 36, casting, 0, 0, 0, -14);
    plate(pan, 0.85, section, 0, 0, 0, 4.35);
    function finFace(inner, outer, y, thickness) {
      for (const phi of [wallStart, wallStart + wallArc]) {
        const r = (outer + inner) / 2;
        add(
          new T.BoxGeometry(0.8, thickness, outer - inner),
          section,
          0,
          r * Math.sin(phi),
          y,
          r * Math.cos(phi),
          0,
          phi,
        );
      }
    }

    // The opened fin sectors expose both the honing and the ring pack.
    for (let i = 0; i < 7; i++) {
      const y = -8 - i * 12,
        R = radius + 7 + 3 * Math.sin((i * Math.PI) / 6);
      finFace(radius + 1, R, y, 1.95);
      lathe(
        [
          [radius + 1, -1],
          [R, -1],
          [R + 0.5, 0],
          [R, 0.95],
          [radius + 1, 0.95],
        ],
        casting,
        0,
        0,
        y,
        0,
        0,
        wallStart,
        wallArc,
      );
    }
    for (const y of [0, -stroke - 5])
      lathe(
        [
          [radius, -1.8],
          [radius + 3, -1.8],
          [radius + 3, 1.8],
          [radius, 1.8],
        ],
        bright,
        0,
        0,
        y,
        0,
        0,
        wallStart,
        wallArc,
      );
    finFace(radius * 0.8, radius + 6, 4, 8);
    // A section of the head deck and the rear cam carrier.
    lathe(
      [
        [radius * 0.8, 0],
        [radius + 6, 0],
        [radius + 6, 8],
        [radius * 0.8, 8],
      ],
      casting,
      0,
      0,
      0,
      0,
      0,
      wallStart,
      wallArc,
    );
    add(new T.BoxGeometry(bore * 0.98, 8, 9), casting, 0, 0, camY - 3, -18);
    for (const side of [-1, 1]) {
      const x = side * valveX,
        j = side < 0 ? 4 : 5,
        cam = j + 2,
        which = side < 0 ? "intake" : "exhaust";
      const vr = CylinderModel.valves[which].diameter * 500;
      port(side, vr);
      // Valve seat, conical face, stem, guide, lower spring seat and moving retainer.
      lathe(
        [
          [vr - 1, -0.4],
          [vr + 1, 0.4],
          [vr + 1, 1.6],
          [vr, 1.6],
        ],
        bronze,
        0,
        x,
        0,
        0,
        0,
        wallStart,
        wallArc,
        28,
      );
      lathe(
        [
          [0, -1],
          [vr - 1, -1],
          [vr, 0.2],
          [vr * 0.63, 2.1],
          [3, 4],
          [2, 8],
          [0, 8],
        ],
        side < 0 ? steel : hotMetal,
        j,
        x,
        0,
        0,
        side < 0 ? 0 : 2,
      );
      cylinder(1.9, 30, bright, j, x, 18, 0);
      cylinder(3.9, 8, bronze, 0, x, 8, 0);
      cylinder(7.7, 1, graphite, 0, x, 11, 0);
      cylinder(7.6, 1.8, satin, j, x, 30.4, 0);
      const spiral = [];
      for (let k = 0; k <= springSteps; k++) {
        const u = k / springSteps,
          a = turn * 5.5 * u;
        spiral.push(new T.Vector3(5.8 * Math.cos(a), 11.8 + 17.6 * u, 5.8 * Math.sin(a)));
      }
      add(
        new T.TubeGeometry(new T.CatmullRomCurve3(spiral), springSteps, 0.91, 5, false),
        side < 0 ? bronze : steel,
        j,
        x,
        0,
        0,
        0,
        0,
        0,
        0,
        (y) => Math.min(1, Math.max(0, (y - 11.8) / 17.6)),
      );
      cylinder(3.0, 8, graphite, j, x, camY - 14, 0, Math.PI / 2);
      cylinder(1.1, 8.6, bright, j, x, camY - 14, 0, Math.PI / 2);
      const contour = Array.from({ length: camSteps }, (_, i) =>
        camPoint(which, (turn * i) / camSteps),
      );
      plate(contour, 7.5, satin, cam, 0, 0, 0);
      cylinder(5, 29, steel, cam, 0, 0, -3, Math.PI / 2);
      eye(9, 5.2, 9, casting, 0, x, camY, -15);
      eye(7, 5.1, 1.6, bronze, 0, x, camY, -10);
      for (const offset of [-10.4, 10.4]) {
        add(new T.BoxGeometry(6.3, 5.7, 11), casting, 0, x + offset, camY - 2.4, -15);
        cylinder(1.6, 6, steel, 0, x + offset, camY - 0.4, -15);
        cylinder(2.8, 2.4, bright, 0, x + offset, camY + 2.8, -15, 0, 6);
      }
      cylinder(4.1, 2.5, bronze, cam, 0, 0, 12, Math.PI / 2);
      const studX = side * (radius + 2);
      cylinder(1.5, stroke + 14, steel, 0, studX, -stroke * 0.49, -5);
      cylinder(3, 3.5, bright, 0, studX, 6, -5, 0, 6);
    }
    // Insulated plug with a ground strap, or a separate six-hole diesel injector tip.
    if (engine.ref !== "diesel") {
      lathe(
        [
          [1.7, -2],
          [2, -1],
          [2.7, 0],
          [3.0, 6],
          [3.6, 9],
          [3.6, 18],
          [2.5, 21],
          [1.6, 24],
        ],
        ceramic,
      );
      cylinder(4.1, 4, steel, 0, 0, 5, 0, 0, 6);
      const ribs = [[2.7, 9.2]];
      for (const y of [10.3, 12.8, 15.3, 17.8]) {
        ribs.push(
          [3.35, y - 0.7],
          [4.04, y - 0.38],
          [4.13, y + 0.12],
          [3.85, y + 0.45],
          [3.35, y + 0.7],
        );
      }
      ribs.push([2.8, 19.4]);
      lathe(ribs, ceramic, 0, 0, 0, 0, 0, 0, turn, 24);
      lathe(
        [
          [1.5, 21],
          [2.1, 21.4],
          [2.1, 23.5],
          [2.7, 24.3],
          [2.7, 26],
          [2.15, 26.6],
          [0, 26.6],
        ],
        steel,
      );
      for (const y of [1.2, 2.1, 3.0])
        lathe(
          [
            [2.6, y - 0.4],
            [3.2, y],
            [2.6, y + 0.4],
          ],
          satin,
          0,
          0,
          0,
          0,
          0,
          0,
          turn,
          16,
        );
      cylinder(4.55, 1.0, bronze, 0, 0, 3.1, 0);
      cylinder(0.6, 2, bronze, 0, 0, -2.3, 0);
      add(new T.BoxGeometry(0.75, 3, 0.8), steel, 0, 2, -1.8, 0);
      add(new T.BoxGeometry(2.1, 0.7, 0.8), steel, 0, 1.35, -3.4, 0);
      if (engine.gauge_bar)
        add(new T.CylinderGeometry(2, 1.1, 10, 12), graphite, 0, -radius * 0.68, 3, 4, 0, 0, -0.45);
    } else {
      lathe(
        [
          [1.0, -3],
          [2.4, -1.8],
          [2.8, 1.5],
          [4, 3.5],
          [4, 12],
          [3.3, 15],
          [3.3, 23],
        ],
        steel,
      );
      cylinder(5, 4, bronze, 0, 0, 13, 0, 0, 6);
      lathe(
        [
          [3.1, 19],
          [4.6, 20.5],
          [4.8, 25.4],
          [3.8, 27],
          [2.6, 27],
          [2.6, 30],
          [0, 30],
        ],
        graphite,
      );
      for (const y of [21.3, 24.9]) cylinder(4.95, 0.7, steel, 0, 0, y, 0);
      for (let i = 0; i < 6; i++) {
        const a = (turn * i) / 6;
        add(
          new T.SphereGeometry(0.45, 6, 4),
          black,
          0,
          1.48 * Math.cos(a),
          -2.55,
          1.48 * Math.sin(a),
        );
      }
    }
    // The ring pack has two compression faces and twin rails on a slotted oil-control ring.
    lathe(
      [
        [radius * 0.82, -32],
        [radius * 0.95, -31],
        [radius * 0.98, -26],
        [radius * 0.983, -4],
        [radius * 0.974, -2],
      ],
      satin,
      1,
    );
    lathe(
      [
        [radius * 0.973, -3],
        [radius * 0.973, -2],
        [radius * 0.89, -1.4],
        [radius * 0.66, -0.5],
        [radius * 0.34, -0.1],
        [0, 0],
      ],
      bright,
      1,
      0,
      0,
      0,
      1,
    );
    for (const y of [-4.4, -7.6, -12.6]) {
      lathe(
        [
          [radius * 0.98, -1.1],
          [radius * 0.997, -1.1],
          [radius * 0.997, 1.1],
          [radius * 0.98, 1.1],
        ],
        graphite,
        1,
        0,
        y,
      );
      for (const dy of y === -12.6 ? [-0.88, 0.88] : [0.5])
        lathe(
          [
            [radius * 0.994, -0.23],
            [radius, 0.0],
            [radius * 0.995, 0.25],
          ],
          steel,
          1,
          0,
          y + dy,
        );
    }
    for (let i = 0; i < 14; i++) {
      const a = (i * turn) / 14;
      add(
        new T.BoxGeometry(2.2, 0.75, 0.7),
        black,
        1,
        radius * 0.993 * Math.sin(a),
        -12.6,
        radius * 0.993 * Math.cos(a),
        0,
        a,
      );
    }
    cylinder(5.6, bore * 0.96, bronze, 1, 0, -pinOffset, 0, Math.PI / 2);
    for (const side of [-1, 1]) {
      const z = side * radius * 0.983;
      cylinder(5.4, 0.85, graphite, 1, 0, -pinOffset, z, Math.PI / 2);
      eye(5.45, 3.65, 0.96, bright, 1, 0, -pinOffset, z + side * 0.1);
      cylinder(3.65, 1.02, black, 1, 0, -pinOffset, z + side * 0.1, Math.PI / 2);
    }
    // Rod-local origin is the crankpin. The small-end bore stays concentric with the wrist pin.
    plate(
      [
        [-4.6, 7],
        [-3, rod - 6],
        [3, rod - 6],
        [4.6, 7],
      ],
      3.2,
      graphite,
      2,
      0,
      0,
      0,
    );
    for (const h of [-1, 1])
      plate(
        [
          [h * 5, 8],
          [h * 3.7, rod - 7],
          [h * 2, rod - 7],
          [h * 2.9, 8],
        ],
        7.2,
        satin,
        2,
        0,
        0,
        0,
      );
    eye(10.6, 6.7, 9.2, steel, 2, 0, 0, 0);
    eye(7.8, 4.9, 8.5, steel, 2, 0, rod, 0);
    eye(6.9, 5.9, 9.5, bronze, 2, 0, 0, 0);
    for (const x of [-9, 9]) {
      cylinder(1.55, 9.1, satin, 2, x, -2.7, 1);
      cylinder(2.4, 2.2, bright, 2, x, -6.5, 1, 0, 6);
    }
    // Two cheeks, each with mass opposite the crankpin. The shaft and pins share one throw.
    const cheek = [
      [-8, crankR],
      [-12, 6],
      [-28, -12],
    ];
    for (let i = 0; i <= 18; i++) {
      const a = (1.15 + (i * 0.7) / 18) * Math.PI;
      cheek.push([32 * Math.cos(a), 32 * Math.sin(a)]);
    }
    cheek.push([28, -12], [12, 6], [8, crankR]);
    for (const z of [-10, 10]) {
      plate(cheek, 5.6, graphite, 3, 0, 0, z);
      eye(8.2, 5.8, 6, steel, 3, 0, crankR, z);
    }
    cylinder(6.3, 24, bronze, 3, 0, crankR, 0, Math.PI / 2);
    cylinder(8.6, 42, steel, 3, 0, 0, 0, Math.PI / 2);
    cylinder(5, 3, bright, 3, 0, 0, 22, Math.PI / 2, 6);
    // Degree wheel on the crank nose. Each minor division spans ten crank degrees.
    eye(18.6, 8.8, 2.4, graphite, 3, 0, 0, 20.7);
    eye(19.4, 18.55, 2.5, steel, 3, 0, 0, 20.7);
    for (let i = 0; i < 36; i++) {
      const a = (i * turn) / 36,
        major = i % 3 === 0,
        r = major ? 15.75 : 16.6;
      add(
        new T.PlaneGeometry(major ? 0.88 : 0.5, major ? 4.1 : 2.4),
        i === 0 ? bronze : bright,
        3,
        r * Math.sin(a),
        r * Math.cos(a),
        22.05,
        0,
        0,
        -a,
      );
    }
    for (const z of [-13.3, 13.3]) {
      for (const x of [-14, 14]) {
        cylinder(3.4, 0.65, steel, 3, x, -18, z, Math.PI / 2, 12);
        cylinder(2.35, 1.0, black, 3, x, -18, z, Math.PI / 2, 8);
      }
    }
    const g = new T.BufferGeometry();
    for (const [name, array, n] of [
      ["position", positions, 3],
      ["normal", normals, 3],
      ["color", colors, 3],
      ["joint", joints, 1],
      ["surface", surfaces, 4],
    ])
      g.setAttribute(name, new T.Float32BufferAttribute(array, n));
    g.setIndex(indices);
    const halfWidth = Math.max(hw + 9, radius + 29);
    const shadows = CylinderStudio.keyShadows(
      T,
      g,
      { value: transforms },
      { halfWidth, bottom: bottom - 4, top: camY + 20 },
      compact,
    );
    const uniform = {
      ...shadows.uniforms,
      flameSpill: { value: new T.Vector3() },
      joints: { value: transforms },
      studioMap: { value: CylinderStudio.reflectionAtlas(T) },
      crownGlow: { value: new T.Vector3() },
      valveGlow: { value: new T.Vector3() },
      crankPin: { value: new T.Vector2() },
      wristY: { value: 0 },
    };
    const material = new T.ShaderMaterial({
      uniforms: uniform,
      vertexColors: true,
      vertexShader: `
          ${CylinderStudio.jointGLSL}
          uniform mat4 keyProjection;
          varying vec3 keyCoord;
          varying vec3 N, C, finish, partPos, world;
          varying float body;
          void main() {
            world = position;
            N = normal;
            if (joint > .5) {
              mat4 j = joints[int(joint + .5)];
              world = jointPosition(j);
              N = mat3(j) * normal;
            }
            keyCoord = (keyProjection * vec4(world + .48 * N, 1.)).xyz * .5 + .5;
            C = color;
            finish = surface.xyz;
            partPos = position;
            body = joint;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.);
          }
        `,
      fragmentShader: `
          varying vec3 N, C, finish, partPos, world;
          varying float body;
          uniform vec3 crownGlow, valveGlow;
          uniform vec3 flameSpill;
          varying vec3 keyCoord;
          uniform sampler2D keyDepth;
          uniform float shadowTexel;
          uniform bool quickLight;
          #include <packing>
          float sampleLight(vec2 uv) {
            return step(keyCoord.z - .0016, unpackRGBAToDepth(texture2D(keyDepth, uv)));
          }
          float keyVisibility() {
            if (quickLight) return sampleLight(keyCoord.xy);
            vec2 xy = keyCoord.xy / shadowTexel - .5, blend = fract(xy);
            vec2 uv = (floor(xy) + .5) * shadowTexel;
            return mix(
                mix(sampleLight(uv), sampleLight(uv + vec2(shadowTexel, 0.)), blend.x),
                mix(sampleLight(uv + vec2(0., shadowTexel)), sampleLight(uv + shadowTexel), blend.x),
                blend.y);
          }
          uniform vec2 crankPin;
          uniform float wristY;
          ${CylinderStudio.reflectionGLSL}
          const float PI = 3.14159265;
          vec3 direct(vec3 n, vec3 v, vec3 l, vec3 light, vec3 base, vec3 f0, float a2) {
            vec3 h = normalize(v + l);
            float nl = max(dot(n, l), 0.), nv = max(dot(n, v), .008), nh = max(dot(n, h), 0.),
                  vh = max(dot(v, h), 0.);
            float d = nh * nh * (a2 - 1.) + 1., D = a2 / (PI * d * d);
            float vis =
                .5 / (nl * sqrt(nv * nv * (1. - a2) + a2) + nv * sqrt(nl * nl * (1. - a2) + a2) + .0001);
            vec3 F = f0 + (1. - f0) * pow(1. - vh, 5.);
            return light * nl * ((1. - F) * base / PI + D * vis * F);
          }
          // Subpixel grooves fade as the view pulls back. Surface coordinates follow each joint.
          float toolMarks(float phase) { return sin(phase) * (1. - smoothstep(.7, 3.14, fwidth(phase))); }
          void main() {
            vec3 n = normalize(N);
            vec3 v = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
            float rough = finish.x;
            bool isCast = rough > .54;
            vec3 base = C;
            if (!quickLight) {
              float milling = body > .5 && body < 1.5 ? mix(partPos.y, length(partPos.xz), abs(n.y))
                                                      : dot(partPos, vec3(.79, 1.09, .42));
              float grain = toolMarks(6. * milling);
              if (isCast)
                grain = toolMarks(dot(partPos, vec3(3.7, 2.1, 2.6))) *
                        toolMarks(dot(partPos, vec3(-2.4, 4.1, 1.5)));
              rough = clamp(rough + grain * (isCast ? .07 : .036), .12, .85);
              base *= 1. + grain * (isCast ? .13 : .045);
              if (finish.z > 2.5)
                base *= .95 + .12 * toolMarks(1.65 * (partPos.x + .77 * partPos.y + .43 * partPos.z));
            }
            float ao = .76 + .24 * smoothstep(-.65, .52, n.y);
            if (body < .5 && world.z < -10.) {
              // Penumbra of the moving rod on the recessed casting, projected along the key light.
              vec2 from = crankPin, to = vec2(0., wristY);
              vec2 p = world.xy + (world.z * .18) * vec2(.85, -1.);
              vec2 ab = to - from;
              float t = clamp(dot(p - from, ab) / max(dot(ab, ab), 1.), 0., 1.);
              float shadow = smoothstep(3.5, 15., length(p - from - t * ab));
              ao *= mix(1., .45 + .55 * shadow, smoothstep(10., 25., -world.z));
            }
            if (body < .5 && world.y < -2. && world.y > -84.) {
              float valley = fract((-world.y - 8.) / 12.);
              ao *= .78 + .22 * smoothstep(.0, .35, valley);
            }
            float nv = clamp(dot(n, v), .0, 1.);
            vec3 f0 = mix(vec3(.042), base, finish.y);
            vec3 F = f0 + (max(vec3(1. - rough), f0) - f0) * pow(1. - nv, 5.);
            vec3 diffuse = base * (1. - finish.y);
            vec3 env = studioLight(reflect(-v, n), rough);
            float lit = keyVisibility();
            vec3 color = (env * F * (.44 + .56 * lit) + diffuse * (.25 + .35 * max(n.y, 0.))) * ao;
            color += lit * ao *
                     direct(n, v, normalize(vec3(-.57, .79, .62)), vec3(2.85, 2.58, 2.28), diffuse, f0,
                            pow(rough, 4.));
            if (!quickLight)
              color += direct(n, v, normalize(vec3(.62, .31, -.71)), vec3(1.00, 1.38, 1.91), diffuse, f0,
                              pow(rough, 4.));
            color +=
                finish.z > .5 && finish.z < 2.5 ? (finish.z < 1.5 ? crownGlow : valveGlow) : vec3(0.);
            vec3 toFlame = vec3(0., -.16 * abs(wristY + 16.), 0.) - world;
            float d2 = dot(toFlame, toFlame);
            color += flameSpill * base *
                     (.10 + .90 * max(dot(n, toFlame * inversesqrt(max(d2, .01))), 0.)) /
                     (1. + .0019 * d2);
            gl_FragColor = vec4(color, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }
        `,
    });

    const assembly = new T.Mesh(g, material);
    assembly.frustumCulled = false;
    scene.add(assembly);
    const glass = new T.Mesh(
      new T.CylinderGeometry(
        radius + 0.7,
        radius + 0.7,
        stroke + 7,
        rings,
        1,
        true,
        wallStart,
        wallArc,
      ),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        forceSinglePass: true,
        uniforms: { studioMap: uniform.studioMap },
        vertexShader: `
          varying vec2 st;
          varying vec3 wn;
          void main() {
            st = uv;
            wn = normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          }
        `,
        fragmentShader: `
          varying vec2 st;
          varying vec3 wn;
          ${CylinderStudio.reflectionGLSL}
          void main() {
            vec3 n = normalize(wn);
            vec3 v = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
            float nv = abs(dot(n, v));
            float fresnel = .038 + .962 * pow(1. - nv, 5.);
            // Beer-Lambert attenuation through a thin liner, with a bounded grazing path.
            float absorb = 1. - exp(-.047 / max(.12, nv));
            vec2 phase = vec2(st.x * 78. + st.y * 45., st.x * 78. - st.y * 45.);
            vec2 aa = max(fwidth(phase), .027);
            vec2 hone = (1. - smoothstep(vec2(0.), aa * .52, abs(fract(phase) - .5))) *
                        (1. - smoothstep(vec2(.32), vec2(.80), aa));
            vec2 edgeDist = min(st, 1. - st) / max(fwidth(st), vec2(.0001));
            float lip = 1. - smoothstep(.35, 2.1, min(edgeDist.x, edgeDist.y));
            vec3 env = studioLight(reflect(-v, n), .18);
            vec3 color = mix(vec3(.045, .23, .24), env, clamp(.4 + fresnel + lip, 0., 1.));
            color += lip * vec3(.30, .60, .55);
            float alpha = clamp(absorb + fresnel * .53 + .33 * lip + .085 * (hone.x + hone.y), 0., .82);
            gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }
        `,
      }),
    );
    glass.position.y = -(stroke + 7) / 2;
    glass.renderOrder = 1;
    scene.add(glass);
    // A soft contact footprint keeps the two feet registered to the same studio floor.
    const footprint = new T.Mesh(
      new T.PlaneGeometry(hw * 3.8, 144),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { feet: { value: (hw - 9) / (hw * 3.8) } },
        vertexShader: `
          varying vec2 st;
          void main() {
            st = uv - .5;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          }
        `,
        fragmentShader: `
          varying vec2 st;
          uniform float feet;
          void main() {
            vec2 p = vec2(abs(st.x) - feet, st.y + .035);
            float contact = exp(-dot(p * p, vec2(125., 88.)));
            float soft = exp(-dot(st * st, vec2(21., 23.)));
            gl_FragColor = vec4(.005, .012, .019, .53 * contact + .23 * soft);
          #include <colorspace_fragment>
          }
        `,
      }),
    );
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.set(0, bottom - 3.6, -11);
    footprint.renderOrder = -1;
    scene.add(footprint);
    function pose(a, s, crownGlow, valveGlow) {
      const t = a * rad,
        cx = crankR * Math.sin(t),
        cy = axle + crankR * Math.cos(t),
        pistonY = -s.piston * 1000;
      transforms[1].makeTranslation(0, pistonY, 0);
      transforms[2].makeRotationZ(Math.atan2(cx, pistonY - pinOffset - cy)).setPosition(cx, cy, 0);
      transforms[3].makeRotationZ(-t).setPosition(0, axle, 0);
      transforms[4].makeTranslation(0, -1000 * s.intake, 0);
      transforms[5].makeTranslation(0, -1000 * s.exhaust, 0);
      transforms[6].makeRotationZ(-t / 2).setPosition(-valveX, camY, 0);
      transforms[7].makeRotationZ(-t / 2).setPosition(valveX, camY, 0);
      uniform.crankPin.value.set(cx, cy);
      uniform.wristY.value = pistonY - pinOffset;
      uniform.crownGlow.value.fromArray(crownGlow);
      uniform.valveGlow.value.fromArray(valveGlow);
      material.uniformsNeedUpdate = true;
    }
    return {
      scene,
      pose,
      bore,
      stroke,
      axle,
      camY,
      bottom: bottom - 4,
      halfWidth,
      shadows,
      flameSpill: uniform.flameSpill.value,
      runners,
    };
  }
  return { build, camPoint };
})();
