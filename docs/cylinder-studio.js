/* Original studio lighting for the cutaway. The octahedral atlas stores linear HDR
   radiance prefiltered with GGX. One texture serves both lanes and all architectures. */
globalThis.CylinderStudio = (() => {
  const size = 64,
    levels = 5,
    range = 12;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  function octDirection(u, v) {
    let x = 2 * u - 1,
      y = 2 * v - 1;
    const z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) {
      const oldX = x;
      x = (1 - Math.abs(y)) * Math.sign(x);
      y = (1 - Math.abs(oldX)) * Math.sign(y);
    }
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length];
  }
  function texel(x, y, z) {
    const inv = 1 / (Math.abs(x) + Math.abs(y) + Math.abs(z));
    let u = x * inv,
      v = y * inv;
    if (z < 0) {
      const oldU = u;
      u = (1 - Math.abs(v)) * (u < 0 ? -1 : 1);
      v = (1 - Math.abs(oldU)) * (v < 0 ? -1 : 1);
    }
    const pixel = (t) => Math.round((0.5 + 0.5 * t) * (size - 1));
    return 3 * (pixel(u) + size * pixel(v));
  }
  // Angular extents are half-widths of rectangular emitters on their respective planes.
  function panel(x, y, z, width, height, color) {
    const n = Math.hypot(x, y, z),
      h = Math.hypot(x, z);
    return {
      normal: [x / n, y / n, z / n],
      right: [z / h, 0, -x / h],
      up: [(-x * y) / (h * n), h / n, (-z * y) / (h * n)],
      width,
      height,
      color,
    };
  }
  const panels = [
    panel(0.1, 0.16, 0.99, 0.61, 0.68, [0.33, 0.37, 0.42]),
    panel(-0.76, 0.81, 0.92, 0.52, 0.78, [6.3, 5.5, 4.5]),
    panel(0.72, 0.15, 0.69, 0.105, 0.92, [3.2, 4.8, 6.2]),
    panel(0.18, 0.94, -0.5, 0.79, 0.25, [7.8, 8.4, 9.0]),
    panel(-0.71, 0.18, -0.68, 0.19, 0.53, [2.5, 3.7, 4.1]),
    panel(0.62, -0.17, -0.72, 0.31, 0.12, [3.1, 1.5, 0.68]),
  ];
  function studio(dir) {
    const [x, y, z] = dir,
      sky = clamp(0.5 + 0.5 * y);
    const c = [0.042 + 0.15 * sky, 0.052 + 0.2 * sky, 0.071 + 0.3 * sky];
    for (const p of panels) {
      const dot = (v) => x * v[0] + y * v[1] + z * v[2];
      const forward = dot(p.normal);
      if (forward <= 0) continue;
      const edge = Math.max(
        Math.abs(dot(p.right) / forward) - p.width,
        Math.abs(dot(p.up) / forward) - p.height,
      );
      const t = clamp(0.5 - edge * 14),
        weight = t * t * (3 - 2 * t);
      for (let i = 0; i < 3; i++) c[i] += weight * p.color[i];
    }
    return c;
  }
  let atlas;
  function reflectionAtlas(T) {
    if (atlas) return atlas;
    const data = new Uint8Array(size * size * levels * 4);
    const base = new Float32Array(size * size * 3);
    const directions = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dir = octDirection(x / (size - 1), y / (size - 1));
        directions.push(dir);
        base.set(studio(dir), 3 * (y * size + x));
      }
    for (let k = 0; k < levels; k++) {
      const rough = k / (levels - 1),
        a2 = rough ** 4;
      // Hammersley points in the GGX half-vector distribution, reflected about N=V.
      const samples = [];
      for (let i = 0; i < 48 && k; i++) {
        let bits = i,
          v = 0;
        for (let b = 0.5; bits; b *= 0.5, bits >>= 1) v += (bits & 1) * b;
        const phi = (2 * Math.PI * (i + 0.5)) / 48;
        const cos2 = (1 - v) / (1 + (a2 - 1) * v),
          nz = 2 * cos2 - 1;
        if (nz <= 0) continue;
        const xy = 2 * Math.sqrt(cos2 * (1 - cos2));
        samples.push([xy * Math.cos(phi), xy * Math.sin(phi), nz]);
      }
      directions.forEach(([x, y, z], index) => {
        const len = Math.hypot(x, z),
          tx = len ? z / len : 1,
          tz = len ? -x / len : 0;
        const bx = y * tz,
          by = z * tx - x * tz,
          bz = -y * tx;
        let r = base[3 * index],
          g = base[3 * index + 1],
          b = base[3 * index + 2],
          weight = 1;
        if (k) {
          r = g = b = weight = 0;
          for (const [s, t, n] of samples) {
            const p = texel(tx * s + bx * t + x * n, by * t + y * n, tz * s + bz * t + z * n);
            r += n * base[p];
            g += n * base[p + 1];
            b += n * base[p + 2];
            weight += n;
          }
        }
        const encode = (v) => Math.round(255 * Math.sqrt(clamp(v / (weight * range))));
        data.set([encode(r), encode(g), encode(b), 255], 4 * (index + k * size * size));
      });
    }
    atlas = new T.DataTexture(data, size, size * levels, T.RGBAFormat);
    atlas.minFilter = atlas.magFilter = T.LinearFilter;
    atlas.generateMipmaps = false;
    atlas.needsUpdate = true;
    return atlas;
  }
  const reflectionGLSL = `
          uniform sampler2D studioMap;
          vec3 studioLight(vec3 d, float roughness) {
            vec2 uv = d.xy / (abs(d.x) + abs(d.y) + abs(d.z));
            if (d.z < 0.) uv = (1. - abs(uv.yx)) * (step(vec2(0.), uv) * 2. - 1.);
            uv = (.5 + (.5 + .5 * uv) * ${size - 1}.) / ${size}.;
            float level = clamp(roughness, 0., 1.) * ${levels - 1}.;
            vec2 p = vec2(uv.x, (uv.y + floor(level)) / ${levels}.);
            vec3 a = texture2D(studioMap, p).rgb;
            vec3 b = texture2D(studioMap, p + vec2(0., 1. / ${levels}.)).rgb;
            return ${range}. * mix(a * a, b * b, fract(level));
          }
        `;
  // Both comparison lanes have identical hard-part positions at a given crank angle.
  // Render one light-space depth image and reuse it for camera changes and both fuels.
  const jointGLSL = `
          attribute float joint;
          attribute vec4 surface;
          uniform mat4 joints[8];
          vec3 jointPosition(mat4 j) { return mix(position, (j * vec4(position, 1.)).xyz, surface.w); }
        `;
  function keyShadows(T, geometry, joints, { halfWidth, bottom, top }, compact) {
    const scene = new T.Scene(),
      camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 850);
    const focus = new T.Vector3(0, (bottom + top) / 2, 0);
    camera.position.copy(focus).addScaledVector(new T.Vector3(-0.57, 0.79, 0.62).normalize(), 400);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
    const bounds = new T.Box3();
    for (const x of [-halfWidth, halfWidth])
      for (const y of [bottom, top])
        for (const z of [-43, 43])
          bounds.expandByPoint(new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    camera.left = bounds.min.x - 2;
    camera.right = bounds.max.x + 2;
    camera.bottom = bounds.min.y - 2;
    camera.top = bounds.max.y + 2;
    camera.near = -bounds.max.z - 3;
    camera.far = -bounds.min.z + 3;
    camera.updateProjectionMatrix();
    const size = compact ? 320 : 704;
    const target = new T.WebGLRenderTarget(size, size, {
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    const depth = new T.ShaderMaterial({
      uniforms: { joints },
      vertexShader: `
          ${jointGLSL}
          void main() {
            vec3 posed = jointPosition(joints[int(joint + .5)]);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(posed, 1.);
          }
        `,
      fragmentShader: `
          #include <packing>
          void main() { gl_FragColor = packDepthToRGBA(gl_FragCoord.z); }
        `,
    });
    const caster = new T.Mesh(geometry, depth);
    caster.frustumCulled = false;
    scene.add(caster);
    // On a frame-budget-limited device the fixed casting still occludes the moving
    // parts. Reuse its map during playback; scrubbing restores all moving shadows.
    const fixedGeometry = new T.BufferGeometry();
    for (const name of ["position", "joint", "surface"])
      fixedGeometry.setAttribute(name, geometry.getAttribute(name));
    const fixed = [];
    for (let i = 0; i < geometry.index.count; i += 3) {
      const a = geometry.index.getX(i);
      if (geometry.getAttribute("joint").getX(a) === 0)
        fixed.push(a, geometry.index.getX(i + 1), geometry.index.getX(i + 2));
    }
    fixedGeometry.setIndex(fixed);
    let lastAngle = null;
    const clear = new T.Color();
    return {
      uniforms: {
        quickLight: { value: false },
        keyDepth: { value: target.texture },
        keyProjection: {
          value: new T.Matrix4().multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse,
          ),
        },
        shadowTexel: { value: 1 / size },
      },
      render(renderer, angle, fixedOnly = false) {
        const key = fixedOnly ? "casting" : angle;
        if (lastAngle === key) return;
        caster.geometry = fixedOnly ? fixedGeometry : geometry;
        const previous = renderer.getRenderTarget(),
          alpha = renderer.getClearAlpha();
        renderer.getClearColor(clear);
        renderer.setRenderTarget(target);
        renderer.setClearColor(0xffffff, 1);
        depth.uniformsNeedUpdate = true;
        renderer.render(scene, camera);
        renderer.setRenderTarget(previous);
        renderer.setClearColor(clear, alpha);
        lastAngle = key;
      },
      invalidate() {
        lastAngle = null;
      },
      dispose() {
        target.dispose();
        depth.dispose();
        fixedGeometry.dispose();
      },
    };
  }

  return { reflectionAtlas, reflectionGLSL, jointGLSL, keyShadows };
})();
