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
  // Integral of pi*min(boreR²,r²-y²) from the head to the piston, divided by pi.
  function frontRadius(boreR, height, volumeFraction) {
    if (volumeFraction <= 0) return 0;
    let lo = 0,
      hi = Math.hypot(boreR, height);
    if (volumeFraction >= 1) return hi;
    const target = volumeFraction * boreR * boreR * height;
    for (let i = 0; i < 21; i++) {
      const r = (lo + hi) / 2,
        end = Math.min(height, r);
      const full = Math.min(end, Math.sqrt(Math.max(0, r * r - boreR * boreR)));
      const volume =
        boreR * boreR * full + (end - full) * (r * r - (end * end + end * full + full * full) / 3);
      if (volume < target) lo = r;
      else hi = r;
    }
    return (lo + hi) / 2;
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
      frontRadius: { value: 0 },
      flowPhase: { value: 0 },
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
        blending: T.NormalBlending,
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
          uniform float height, boreR, radius, hot, burned, diesel, knock, frequency, sound, brightness,
              sparkAge, frontRadius, flowPhase;
          varying vec3 world;

          // Exact chord through a sphere, clipped to the wall, roof and moving piston.
          float chord(vec3 rayOrigin, vec3 rayDirection, vec3 center, float radiusMm, float nearHit,
                      float farHit) {
            vec3 d = rayOrigin - center;
            float b = dot(d, rayDirection), discriminant = b * b - dot(d, d) + radiusMm * radiusMm;
            if (discriminant <= 0.) return 0.;
            float h = sqrt(discriminant);
            return max(0., min(farHit, -b + h) - max(nearHit, -b - h));
          }

          // Chord through a prolate ellipsoid with its long axis on one injector jet.
          float jetChord(vec3 d, vec3 rd, vec3 axis, float width, float halfLength, float lo, float hi) {
            float dz = dot(d, axis), rz = dot(rd, axis), iw = 1. / (width * width);
            float delta = 1. / (halfLength * halfLength) - iw;
            float a = iw + rz * rz * delta, b = dot(d, rd) * iw + dz * rz * delta;
            float c = dot(d, d) * iw + dz * dz * delta - 1., discr = b * b - a * c;
            if (discr <= 0.) return 0.;
            float span = sqrt(discr);
            return max(0., min(hi, (-b + span) / a) - max(lo, (-b - span) / a));
          }

          void main() {
            vec3 rayDirection = direction, rayOrigin = world - 400. * rayDirection;
            float A = dot(rayDirection.xz, rayDirection.xz), b = dot(rayDirection.xz, rayOrigin.xz);
            float nearHit = 0., farHit = 800.;
            if (A > .00001) {
              float wallHit = b * b - A * (dot(rayOrigin.xz, rayOrigin.xz) - boreR * boreR);
              if (wallHit <= 0.) discard;
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
            if (farHit <= nearHit) discard;
            vec3 plug = vec3(0., -3.3, 0.), outLight = vec3(0.);
            float opacity = 0.;
            if (brightness > 0.) {
              float path = farHit - nearHit;
              // Resolve the thin laminar kernel separately from the volume-equivalent bulk front.
              if (diesel < .5) {
                float outer = chord(rayOrigin, rayDirection, plug, radius, nearHit, farHit);
                float inner = chord(rayOrigin, rayDirection, plug,
                                    max(0., radius - max(.32, radius * .05)), nearHit, farHit);
                float kernel = 1. - exp(-.48 * (outer - inner) - .016 * inner);
                vec3 center = vec3(0.);
                float proj = dot(center - rayOrigin, rayDirection);
                vec3 closest = rayOrigin + rayDirection * proj - center;
                float entry = proj - sqrt(max(0., frontRadius * frontRadius - dot(closest, closest)));
                vec3 p = rayOrigin + rayDirection * clamp(entry, nearHit, farHit);
                // Coherent corrugation is anchored to the chamber and repeats at the same crank angle.
                float fold = .45 * sin(dot(p, vec3(.23, .13, .19)) + flowPhase) +
                             .34 * sin(dot(p, vec3(-.15, .37, .11)) - 1.31 * flowPhase) +
                             .21 * sin(dot(p, vec3(.49, .23, -.31)) + .67 * flowPhase);
                float localR = frontRadius * (1. + .032 * fold);
                float thick = clamp(localR * .055, .32, 2.25);
                float outerPath = chord(rayOrigin, rayDirection, center, localR, nearHit, farHit);
                float corePath =
                    chord(rayOrigin, rayDirection, center, max(0., localR - thick), nearHit, farHit);
                float reaction =
                    (1. - exp(-.32 * (outerPath - corePath))) * (1. - smoothstep(.92, 1., burned));
                // Integrate hot-gas emission along the visible chord. A deterministic
                // advected sheet field illustrates unresolved turbulent structure.
                float depth = 0.;
                if (corePath > .01 && hot > .001) {
                  float start = max(nearHit, entry), stepMm = corePath / 6.;
                  for (int i = 0; i < 6; i++) {
                    vec3 q = rayOrigin + rayDirection * (start + (float(i) + .5) * stepMm);
                    vec3 f = q * .24;
                    float curl =
                        sin(f.x + .71 * f.z + .7 * flowPhase) + .55 * sin(f.z - f.y - .6 * flowPhase);
                    float sheet = sin(1.48 * f.y + .67 * f.x + 1.85 * curl - .72 * flowPhase) +
                                  .42 * sin(1.4 * f.z - .91 * f.x + curl + flowPhase);
                    float ridge = max(0., 1. - abs(sheet));
                    depth += stepMm * (.0025 + .105 * ridge * ridge * ridge);
                  }
                }
                float core = (1. - exp(-depth)) * hot;
                vec3 edge = mix(vec3(.065, .23, 1.), emission, .51);
                outLight = brightness * (2.7 * kernel * emission + (1.30 + .35 * fold) * reaction * edge +
                                         .71 * core * emission);
                opacity = clamp(kernel * .88 + reaction * (.63 + .19 * fold) + core * .82, 0., .94);
              } else {
                float jets = 0., mantle = 0.;
                for (int i = 0; i < 6; i++) {
                  float az = 6.2831853 * float(i) / 6.;
                  vec3 axis = normalize(vec3(cos(az), -.78, sin(az)));
                  float reach = min(boreR * .97, 2. + boreR * pow(burned, .38));
                  vec3 center = plug + axis * .57 * reach;
                  float width = 1. + reach * .13;
                  float outer = jetChord(rayOrigin - center, rayDirection, axis, width, reach * .49,
                                         nearHit, farHit);
                  float inner = jetChord(rayOrigin - center, rayDirection, axis, width * .67, reach * .45,
                                         nearHit, farHit);
                  jets += inner;
                  mantle += outer - inner;
                }
                float core = (1. - exp(-.23 * jets)), rim = 1. - exp(-.25 * mantle);
                float mist = (1. - exp(-.011 * path)) * hot;
                outLight =
                    brightness * (core * emission * 1.85 + rim * mix(emission, vec3(.20, .36, 1.), .39) +
                                  .28 * mist * emission);
                opacity = min(.94, core * .81 + rim * .68 + mist * .28);
              }
            }
            if (sparkAge >= 0.) {
              vec3 source = vec3(.9, -3.3, 0.);
              float channel = chord(rayOrigin, rayDirection, source, .74, nearHit, farHit);
              float halo = chord(rayOrigin, rayDirection, source, 2.45, nearHit, farHit);
              float spark = (1. - exp(-2.7 * channel - .075 * halo)) * exp(-sparkAge / .00032);
              outLight += vec3(.49, .66, 1.) * 4.6 * spark;
              opacity = max(opacity, min(1., spark));
            }
            if (knock >= 0.) {
              vec3 source = vec3(boreR * .76, -min(height * .46, 9.), boreR * .18);
              float fade = exp(-knock / .0011);
              float flash = 1. - exp(-.56 * chord(rayOrigin, rayDirection, source, 1.2 + 2.6 * fade,
                                                  nearHit, farHit));
              // First outward acoustic shell, then the damped bore mode behind it.
              float waveR = 1000. * sound * knock;
              float shell = 0.;
              if (waveR > 0. && waveR < 2.4 * boreR) {
                float outer = chord(rayOrigin, rayDirection, source, waveR, nearHit, farHit);
                float inner =
                    chord(rayOrigin, rayDirection, source, max(0., waveR - 1.4), nearHit, farHit);
                shell = 1. - exp(-.35 * (outer - inner));
              }
              float waves = 0.;
              for (int i = 0; i < 5; i++) {
                vec3 p = rayOrigin + rayDirection * mix(nearHit, farHit, (float(i) + .5) / 5.);
                float d = length(p - source), propagation = knock - d / (1000. * sound);
                if (propagation >= 0.) {
                  float phase = 6.2831853 * frequency * propagation;
                  float crest = .5 + .5 * (.72 * cos(phase) + .28 * cos(3. * phase));
                  waves += pow(crest, 10.) * exp(-d / boreR) / 5.;
                }
              }
              float echo = fade * (shell + .70 * waves);
              outLight += vec3(.44, .78, 1.) * (flash * 3.4 * fade + echo * .85);
              opacity = max(opacity, min(.96, flash * fade + .56 * echo));
            }
            if (opacity < .002) discard;
            gl_FragColor = vec4(outLight / max(opacity, .03), opacity);

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }
        `,
      }),
    );
    flame.frustumCulled = false;
    flame.renderOrder = 2;
    G.add(flame);
    const count = 384,
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
            float az = 6.2831853 * seed.y;
            float aperture = sqrt(seed.z), ageRatio = age / lifetime;
            vec3 origin = vec3(-boreR * .48, -1., 0.);
            vec3 axis = normalize(vec3(.40, -1., 0.));
            float spread = .44;
            if (mode > .5 && mode < 1.5) {
              origin = vec3(-boreR * .68, -1., 4.);
              axis = normalize(vec3(.82, -1., .12));
              spread = .32;
            } else if (mode > 1.5) {
              origin = vec3(0., -3., 0.);
              float nozzle = 6.2831853 * mod(floor(seed.x * 384.), 6.) / 6.;
              axis = normalize(vec3(cos(nozzle), -.80, sin(nozzle)));
              spread = .15;
            }
            vec3 tangent = normalize(cross(axis, vec3(0., 0., 1.)));
            vec3 bitangent = cross(axis, tangent);
            az += .57 * ageRatio;
            vec3 dir = normalize(axis + spread * aperture * (cos(az) * tangent + sin(az) * bitangent));
            float travel = age * 1000. * speed * (1. - .16 * aperture) / (1. + age * 350.);
            vec3 p = origin + dir * travel;
            if (-p.y > height || length(p.xz) > boreR * .98) {
              gl_Position = vec4(2., 2., 2., 1.);
              gl_PointSize = 1.;
              return;
            }
            float d2 = max(0., 1. - age / lifetime);
            alpha = .71 * d2;
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
            if (edge >= 1.) discard;
            gl_FragColor =
                vec4(mix(vec3(.65, .72, .77), vec3(.20, .66, .95), cooling) +
                         vec3(.52) * exp(-26. * dot(xy + vec2(.16, -.14), xy + vec2(.16, -.14))),
                     alpha * (1. - smoothstep(.11, 1., edge)));
          #include <colorspace_fragment>
          }
        `,
      }),
    );
    spray.frustumCulled = false;
    spray.renderOrder = 3;
    G.add(spray);
    const tracers = rig.runners.map(({ geometry }, i) => {
      const tracer = new T.Mesh(
        geometry,
        new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            phase: { value: 0 },
            strength: { value: 0 },
            tint: { value: new T.Color(i ? 0xffa466 : 0x65d8f2) },
          },
          vertexShader: `
          varying vec2 st;
          void main() {
            st = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          }
        `,
          fragmentShader: `
          varying vec2 st;
          uniform float phase, strength;
          uniform vec3 tint;
          void main() {
            float transverse = st.y * 6. + .16 * sin(6.28 * st.x);
            float line = max(0., 1. - abs(fract(transverse) - .5) * 8.);
            float longitudinal = st.x * 2.5 - phase + floor(transverse) * .31;
            float wake = .5 + .5 * cos(6.283185 * longitudinal);
            float alpha = strength * line * line * pow(wake, 3.);
            if (alpha < .012) discard;
            gl_FragColor = vec4(tint * (1. + .6 * wake), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }
        `,
        }),
      );
      tracer.renderOrder = 3;
      tracer.visible = false;
      G.add(tracer);
      return tracer;
    });
    function apply(lane, s, a, dir, pixelScale, shockAge, showFlow = true) {
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
      // At common pressure, the unburned volume fraction is (1-x_b)*T_u/T_mean
      // with the same effective gas constant used in the one-zone pressure solution.
      const tu = op.x.t * (s.p / op.x.p) ** CylinderModel.isentropicExponent;
      const volumeFraction = burning && s.xb > 0 ? clamp(1 - ((1 - s.xb) * tu) / s.t, 0, 1) : 0;
      un.frontRadius.value = ci ? 0 : frontRadius(R, un.height.value, volumeFraction);
      un.flowPhase.value = burning ? age * 790 : 0;
      un.emission.value.setRGB(...color);
      un.brightness.value = burning
        ? clamp(0.75 + age * 1800, 0, 1) * clamp((s.t - 650) / 1400, 0.25, 1.3)
        : 0;
      const afterFlame = burning ? Math.max(0, age - op.b.span / (6 * lane.rpm)) : 0;
      un.hot.value = lit * clamp((s.t - 700) / 1550, 0, 1) * Math.exp(-afterFlame / 0.0025);
      rig.flameSpill.fromArray(color).multiplyScalar(0.95 * un.hot.value);
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
      tracers.forEach((tracer, i) => {
        const state = CylinderModel.portState(lane, i, a);
        tracer.visible = showFlow && Math.abs(state.rate) > 1e-5;
        if (!tracer.visible) return;
        const u = tracer.material.uniforms;
        u.phase.value = ((2.5 * state.through) / rig.runners[i].volumeM3) % 1;
        u.strength.value = 0.82 * clamp(Math.abs(state.rate) / 0.014, 0, 1);
        tracer.material.uniformsNeedUpdate = true;
      });
    }
    return { group: G, apply };
  }
  return { build, blackbody, flameColor, frontRadius };
})();
