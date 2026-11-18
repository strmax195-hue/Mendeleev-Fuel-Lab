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
    const rings = compact ? 32 : 48,
      springSteps = compact ? 72 : 96,
      camSteps = compact ? 96 : 144;
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
    const steel = [0xb7c6c8, 0.27, 0.88],
      satin = [0x9da9ae, 0.4, 0.82],
      graphite = [0x445054, 0.37, 0.68],
      casting = [0x48716e, 0.55, 0.58],
      bronze = [0xc68a4e, 0.29, 0.81],
      bright = [0xdde4e2, 0.19, 0.9],
      ceramic = [0xf6ede0, 0.24, 0.04],
      black = [0x252f33, 0.5, 0.45],
      hotMetal = [0xa99278, 0.31, 0.83];
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
      for (let i = 0; i < v.count; i++) {
        positions.push(v.getX(i), v.getY(i), v.getZ(i));
        normals.push(n.getX(i), n.getY(i), n.getZ(i));
        colors.push(c.r, c.g, c.b);
        joints.push(j);
        surfaces.push(style[1], style[2], hot, flex ? flex(v.getY(i)) : 1);
      }
      if (g.index) for (const i of g.index.array) indices.push(base + i);
      else for (let i = 0; i < v.count; i++) indices.push(base + i);
      g.dispose();
    }
    const cylinder = (r, h, style, j, x, y, z, rx = 0, segments = compact ? 18 : 24) =>
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
      add(
        new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 }),
        style,
        j,
        x,
        y,
        z - depth / 2,
      );
    }
    function eye(outer, inner, depth, style, j, x, y, z) {
      const shape = new T.Shape();
      shape.absarc(0, 0, outer, 0, turn, false);
      const hole = new T.Path();
      hole.absarc(0, 0, inner, 0, turn, true);
      shape.holes.push(hole);
      add(
        new T.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: false,
          curveSegments: compact ? 9 : 12,
        }),
        style,
        j,
        x,
        y,
        z - depth / 2,
      );
    }
    const wallStart = 0.31 * Math.PI,
      wallArc = 1.38 * Math.PI;
    // The opened fin sectors expose both the honing and the ring pack.
    for (let i = 0; i < 7; i++) {
      const y = -8 - i * 12,
        R = radius + 7 + 3 * Math.sin((i * Math.PI) / 6);
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
      eye(8, 5.2, 5, casting, 0, x, camY, -15);
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
      for (const y of [11, 13.7, 16.4]) cylinder(3.9, 1.1, ceramic, 0, 0, y, 0);
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
    for (const z of [-1, 1]) eye(6.5, 4.7, 0.8, graphite, 1, 0, -pinOffset, z * radius * 0.974);
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
    for (const x of [-9, 9]) cylinder(2.1, 4, bright, 2, x, -4, 4, Math.PI / 2, 6);
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
    const uniform = {
      joints: { value: transforms },
      crownGlow: { value: new T.Vector3() },
      valveGlow: { value: new T.Vector3() },
    };
    const material = new T.ShaderMaterial({
      uniforms: uniform,
      vertexColors: true,
      vertexShader: `

          attribute float joint;
          attribute vec4 surface;
          uniform mat4 joints[8];
          varying vec3 N, C;
          varying vec3 finish;

          void main() {
            mat4 j = joints[int(joint + 0.5)];
            vec3 p = mix(position, (j * vec4(position, 1.)).xyz, surface.w);
            vec4 view = modelViewMatrix * vec4(p, 1.);
            N = normalMatrix * mat3(j) * normal;
            C = color;
            finish = surface.xyz;
            gl_Position = projectionMatrix * view;
          }
        `,
      fragmentShader: `

          varying vec3 N, C;
          varying vec3 finish;
          uniform vec3 crownGlow, valveGlow;
          const float PI = 3.141593;

          vec3 direct(vec3 n, vec3 v, vec3 l, vec3 light, vec3 f0, float a2) {
            vec3 h = normalize(v + l);
            float nl = max(dot(n, l), 0.), nv = max(dot(n, v), .008), nh = max(dot(n, h), 0.),
                  vh = max(dot(v, h), 0.);
            float d = nh * nh * (a2 - 1.) + 1.;
            float D = a2 / (PI * d * d);
            float vis = .5 / (nl * sqrt(nv * nv * (1. - a2) + a2) +
                              nv * sqrt(nl * nl * (1. - a2) + a2) + .0001);
            vec3 F = f0 + (1. - f0) * pow(1. - vh, 5.);
            return light * nl * ((1. - F) * (1. - finish.y) * C / PI + D * vis * F);
          }

          void main() {
            vec3 n = normalize(N), v = vec3(0., 0., 1.);
            vec3 r = reflect(-v, n);
            vec3 f0 = mix(vec3(.04), C, finish.y);
            float a2 = pow(finish.x, 4.);
            float softbox = smoothstep(.35, .86, dot(r, normalize(vec3(-.5, .7, .45)))) +
                            .78 * smoothstep(.88, .98, dot(r, normalize(vec3(.84, .18, .50))));
            vec3 env = mix(vec3(.095, .14, .17), vec3(.46, .58, .64), .5 + .5 * r.y) +
                       vec3(1.75, 1.82, 1.90) * softbox;
            vec3 color =
                .27 * C * (1. - finish.y) + env * f0 +
                direct(n, v, normalize(vec3(-.45, .68, .75)), vec3(2.6, 2.48, 2.25), f0, a2) +
                direct(n, v, normalize(vec3(.72, .32, -.36)), vec3(1.15, 1.55, 1.80), f0, a2);
            color += finish.z < .5 ? vec3(0.) : (finish.z < 1.5 ? crownGlow : valveGlow);
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
        vertexShader: `
          varying vec2 st;
          varying vec3 n;

          void main() {
            st = uv;
            n = normalMatrix * normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          }
        `,
        fragmentShader: `
          varying vec2 st;
          varying vec3 n;

          void main() {
            float edge = pow(1. - abs(normalize(n).z), 2.);
            vec2 phase = vec2(st.x * 58. + st.y * 40., st.x * 58. - st.y * 40.);
            vec2 aa = max(fwidth(phase), .035);
            vec2 hone = (1. - smoothstep(vec2(0.), aa * .48, abs(fract(phase) - .5))) *
                        (1. - smoothstep(vec2(.28), vec2(.75), aa));
            gl_FragColor = vec4(mix(vec3(.27, .49, .52), vec3(.77, .93, .91), edge),
                                .085 + edge * .35 + (hone.x + hone.y) * .09);
          #include <colorspace_fragment>
          }
        `,
      }),
    );
    glass.position.y = -(stroke + 7) / 2;
    glass.renderOrder = 1;
    scene.add(glass);
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
      uniform.crownGlow.value.fromArray(crownGlow);
      uniform.valveGlow.value.fromArray(valveGlow);
      material.uniformsNeedUpdate = true;
    }
    return { scene, pose, bore, stroke, axle, camY };
  }
  return { build, camPoint };
})();
