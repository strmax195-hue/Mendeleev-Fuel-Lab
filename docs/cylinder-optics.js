/* Spectral colour and bounded optical paths for the cutaway. */
globalThis.CylinderOptics = (() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Asymmetric Gaussian approximation to the CIE 1931 observer (Wyman et al., JCGT 2013).
  function observer(w) {
    const g = (m, l, r) => Math.exp(-0.5 * ((w - m) * (w < m ? l : r)) ** 2);
    return [
      0.362 * g(442, 0.0624, 0.0374) +
        1.056 * g(599.8, 0.0264, 0.0323) -
        0.065 * g(501.1, 0.049, 0.0382),
      0.821 * g(568.8, 0.0213, 0.0247) + 0.286 * g(530.9, 0.0613, 0.0322),
      1.217 * g(437, 0.0845, 0.0278) + 0.681 * g(459, 0.0385, 0.0725),
    ];
  }
  function rgb([x, y, z]) {
    const out = [
      3.2406 * x - 1.5372 * y - 0.4986 * z,
      -0.9689 * x + 1.8758 * y + 0.0415 * z,
      0.0557 * x - 0.204 * y + 1.057 * z,
    ];
    const max = Math.max(...out, 1e-30);
    return out.map((v) => Math.max(0, v / max));
  }
  const planck = (nm, t) => 1 / ((nm / 600) ** 5 * Math.expm1(1.438776877e7 / (nm * t)));
  const thermal = Array.from({ length: 181 }, (_, i) => {
    const t = 300 + 25 * i,
      xyz = [0, 0, 0];
    for (let w = 380; w <= 780; w += 5) {
      const o = observer(w),
        p = planck(w, t);
      o.forEach((v, k) => {
        xyz[k] += p * v;
      });
    }
    return rgb(xyz);
  });
  function blackbody(t) {
    return thermal[clamp(Math.round((t - 300) / 25), 0, thermal.length - 1)];
  }
  const ch = rgb(
    observer(431.4).map((v, i) => v + 0.13 * observer(473.7)[i] + 0.035 * observer(516.5)[i]),
  );
  function flameColor(t, soot) {
    const bb = blackbody(t),
      weight = 0.045 + 0.92 * soot;
    return bb.map((v, i) => (1 - weight) * ch[i] + weight * v);
  }
  function metalGlow(t, gasT, flame, lit, view) {
    const level = clamp(planck(685, t) / planck(685, 1030), 0, 3);
    return blackbody(t).map(
      (v, i) => v * level + flame[i] * lit * view * (clamp(gasT, 0, 3200) / 2400) ** 4,
    );
  }
  function build(T, rig) {
    const R = rig.bore / 2,
      G = new T.Group();
    const un = {
      direction: { value: new T.Vector3() },
      height: { value: 1 },
      boreR: { value: R },
      radius: { value: 0 },
      emission: { value: new T.Color() },
      hot: { value: 0 },
      burned: { value: 0 },
      diesel: { value: 0 },
      knock: { value: -1 },
      frequency: { value: 0 },
      sound: { value: 0 },
      brightness: { value: 0 },
      sparkAge: { value: -1 },
    };
    const flame = new T.Mesh(
      new T.BoxGeometry(2 * R, 1, 2 * R).translate(0, -0.5, 0),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        uniforms: un,
        vertexShader: `
          uniform float height;
          varying vec3 world;

          void main() {
            world = vec3(position.x, position.y * height, position.z);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.);
          }
        `,
        fragmentShader: `

          uniform vec3 direction, emission;
          uniform float height, boreR, radius, hot, burned, diesel, knock, frequency, sound,
              brightness, sparkAge;
          varying vec3 world;

          // Exact chord through a sphere, clipped to the wall, roof and moving piston.
          float chord(vec3 rayOrigin, vec3 rayDirection, vec3 center, float radiusMm, float nearHit,
                      float farHit) {
            vec3 d = rayOrigin - center;
            float b = dot(d, rayDirection), discriminant = b * b - dot(d, d) + radiusMm * radiusMm;
            if (discriminant <= 0.)
              return 0.;
            float h = sqrt(discriminant);
            return max(0., min(farHit, -b + h) - max(nearHit, -b - h));
          }

          void main() {
            vec3 rayDirection = direction, rayOrigin = world - 400. * rayDirection;
            float A = dot(rayDirection.xz, rayDirection.xz), b = dot(rayDirection.xz, rayOrigin.xz);
            float nearHit = 0., farHit = 800.;
            if (A > .00001) {
              float wallHit = b * b - A * (dot(rayOrigin.xz, rayOrigin.xz) - boreR * boreR);
              if (wallHit <= 0.)
                discard;
              float h = sqrt(wallHit);
              nearHit = max(nearHit, (-b - h) / A);
              farHit = min(farHit, (-b + h) / A);
            } else if (dot(rayOrigin.xz, rayOrigin.xz) > boreR * boreR)
              discard;
            if (abs(rayDirection.y) > .00001) {
              float a = (-height - rayOrigin.y) / rayDirection.y, c = -rayOrigin.y / rayDirection.y;
              nearHit = max(nearHit, min(a, c));
              farHit = min(farHit, max(a, c));
            } else if (rayOrigin.y > 0. || rayOrigin.y < -height)
              discard;
            if (farHit <= nearHit)
              discard;
            vec3 plug = vec3(0., -3.3, 0.);
            float optical = 0.;
            if (diesel < .5 && radius > 0.) {
              float outer = chord(rayOrigin, rayDirection, plug, radius, nearHit, farHit);
              float inner = chord(rayOrigin, rayDirection, plug,
                                  max(0., radius - max(.42, radius * .055)), nearHit, farHit);
              optical = .34 * (outer - inner) + .022 * inner;
            } else if (diesel > .5 && brightness > 0.) {
              // Six luminous, mixing-controlled ignition regions following the injector holes.
              for (int i = 0; i < 6; i++) {
                float a = 6.2831853 * float(i) / 6.;
                vec3 ray = normalize(vec3(cos(a), -.78, sin(a)));
                float length = min(boreR * .82, 2. + boreR * pow(burned, .38));
                optical += .19 * chord(rayOrigin, rayDirection, plug + ray * length * .70,
                                       1. + length * .17, nearHit, farHit);
              }
            }
            float light = 1. - exp(-optical);
            float bulk = (1. - exp(-.006 * (farHit - nearHit))) * hot;
            vec3 outLight = emission * (light * 2.5 + bulk) * brightness;
            if (sparkAge >= 0.) {
              float channel =
                  chord(rayOrigin, rayDirection, vec3(.9, -3.3, 0.), .90, nearHit, farHit);
              float halo = chord(rayOrigin, rayDirection, vec3(.9, -3.3, 0.), 1.75, nearHit, farHit);
              outLight += vec3(.52, .65, 1.) * (1. - exp(-2. * channel - .09 * halo)) * 4. *
                          exp(-sparkAge / .00032);
            }
            if (knock >= 0.) {
              vec3 source = vec3(boreR * .76, -min(height * .46, 9.), boreR * .18);
              float fade = exp(-knock / .0011);
              float flash = 1. - exp(-.4 * chord(rayOrigin, rayDirection, source, 2. + 3.5 * fade,
                                                 nearHit, farHit));
              float waves = 0.;
              for (int i = 0; i < 6; i++) {
                vec3 p = rayOrigin + rayDirection * mix(nearHit, farHit, (float(i) + .5) / 6.);
                float d = length(p - source), travel = d / (1000. * sound);
                if (knock > travel) {
                  float phase = 6.2831853 * frequency * (knock - travel);
                  float wave = .5 + .5 * (.72 * cos(phase) + .28 * cos(3. * phase));
                  waves += pow(wave, 12.) * exp(-d / boreR) * fade / 6.;
                }
              }
              outLight += vec3(.53, .85, 1.) * (flash * 3.2 * fade + waves * 1.1);
            }
            if (max(max(outLight.r, outLight.g), outLight.b) < .002)
              discard;
            gl_FragColor = vec4(outLight, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }
        `,
      }),
    );
    flame.frustumCulled = false;
    flame.renderOrder = 2;
    G.add(flame);
    const count = 240,
      seeds = new Float32Array(count * 3),
      pos = new Float32Array(count * 3);
    const fract = (x) => x - Math.floor(x);
    for (let i = 0; i < count; i++) {
      seeds.set([(i + 0.5) / count, fract(i * 0.61803398875), fract(i * 0.75487766625)], 3 * i);
    }
    const points = new T.BufferGeometry();
    points.setAttribute("position", new T.BufferAttribute(pos, 3));
    points.setAttribute("seed", new T.BufferAttribute(seeds, 3));
    const su = {
      elapsed: { value: 0 },
      duration: { value: 0 },
      life: { value: 0 },
      height: { value: 1 },
      boreR: { value: R },
      mode: { value: 0 },
      cooling: { value: 0 },
      scalePx: { value: 1 },
      speed: { value: 30 },
    };
    const spray = new T.Points(
      points,
      new T.ShaderMaterial({
        uniforms: su,
        transparent: true,
        depthWrite: false,
        vertexShader: `
          attribute vec3 seed;
          uniform float elapsed, duration, life, height, boreR, mode, scalePx, speed;
          varying float alpha;

          void main() {
            float birth = seed.x * duration, age = elapsed - birth;
            float lifetime = life * (.55 + seed.z * .9);
            alpha = 0.;
            if (age < 0. || age >= lifetime) {
              gl_Position = vec4(2., 2., 2., 1.);
              gl_PointSize = 1.;
              return;
            }
            float a = seed.y * 6.2831853, ad = 6.2831853 * floor(seed.z * 6.) / 6.;
            vec3 dir = normalize(vec3(cos(a) * .32, -1., sin(a) * .32) *
                                 vec3(sqrt(seed.z), 1., sqrt(seed.z)));
            vec3 origin = vec3(-boreR * .48, -1., 0.);
            if (mode < .5)
              dir = normalize(dir + vec3(.40, 0., 0.));
            else if (mode < 1.5) {
              origin = vec3(-boreR * .68, -1., 4.);
              dir = normalize(dir + vec3(.82, 0., .12));
            } else {
              origin = vec3(0., -3., 0.);
              dir = normalize(vec3(cos(ad), -.80, sin(ad)) + .13 * vec3(cos(a), seed.y - .5, sin(a)));
            }
            vec3 p = origin + dir * (age * 1000. * speed / (1. + age * 350.));
            if (-p.y > height || length(p.xz) > boreR * .98) {
              gl_Position = vec4(2., 2., 2., 1.);
              gl_PointSize = 1.;
              return;
            }
            float d2 = max(0., 1. - age / lifetime);
            alpha = .52 * d2;
            gl_PointSize = clamp(scalePx * (.8 + seed.z) * sqrt(d2), 1.35, 9.);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
          }
        `,
        fragmentShader: `
          uniform float cooling;
          varying float alpha;

          void main() {
            vec2 xy = gl_PointCoord - .5;
            float edge = dot(xy, xy) * 4.;
            if (edge >= 1.)
              discard;
            gl_FragColor = vec4(mix(vec3(.76, .84, .88), vec3(.28, .76, 1.), cooling),
                                alpha * (1. - smoothstep(.1, 1., edge)));
          #include <colorspace_fragment>
          }
        `,
      }),
    );
    spray.frustumCulled = false;
    spray.renderOrder = 3;
    G.add(spray);
    function apply(lane, s, a, dir, pixelScale, shockAge) {
      const ci = lane.arch === "diesel",
        op = lane.op,
        age = s.age;
      const burning = op.b && a >= op.b.start && a < 135;
      const lit = burning ? clamp(3 * s.xb, 0, 1) : 0;
      const color = flameColor(Math.max(1200, s.t), lane.s.soot);
      const crown = metalGlow(s.crown, s.t, color, lit, 0.15),
        valve = metalGlow(s.valve, s.t, color, lit, 0.24);
      rig.pose(a, s, crown, valve);
      flame.visible = !!burning || shockAge >= 0;
      un.direction.value.copy(dir);
      un.height.value = s.piston * 1000;
      un.radius.value = s.flameM * 1000;
      un.emission.value.setRGB(...color);
      un.brightness.value = burning
        ? clamp(0.75 + age * 1800, 0, 1) * clamp((s.t - 650) / 1400, 0.25, 1.3)
        : 0;
      un.hot.value = lit * 0.45;
      un.burned.value = burning ? s.xb : 0;
      un.diesel.value = Number(ci);
      un.sparkAge.value = !ci && burning && age < 0.00085 ? age : -1;
      un.knock.value = shockAge;
      un.sound.value = lane.acoustic?.sound ?? 0;
      un.frequency.value = lane.acoustic?.frequency ?? 0;
      flame.material.uniformsNeedUpdate = true;
      const ageDeg = (a - (lane.soi ?? 0) + 720) % 720;
      const elapsed = ageDeg / (6 * lane.rpm),
        pulse = lane.pulse / (6 * lane.rpm);
      const life =
        0.0035 * (lane.s.latent / 400000) * (353 / Math.max(270, ci ? s.t : op.x.t)) ** 0.65;
      spray.visible =
        lane.soi !== null &&
        elapsed <= pulse + life * 1.5 &&
        (ci || lane.arch === "gdi" || s.intake > 0);
      su.elapsed.value = elapsed;
      su.duration.value = pulse;
      su.life.value = life;
      su.height.value = s.piston * 1000;
      su.mode.value = ci ? 2 : lane.arch === "gdi" ? 1 : 0;
      su.speed.value = ci ? 80 : lane.arch === "gdi" ? 42 : 16;
      su.cooling.value = clamp(lane.cooling / 35, 0, 1);
      su.scalePx.value = pixelScale * 1.8;
      spray.material.uniformsNeedUpdate = true;
    }
    return { group: G, apply };
  }
  return { build, blackbody, flameColor };
})();
