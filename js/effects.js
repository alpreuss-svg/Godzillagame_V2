// Effekte ohne Postprocessing (günstig für schwache GPUs): Atomstrahl, Kernpuls, Partikel (Staub, Rauch, Feuer), Trümmer
import * as THREE from 'three';

const VS = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

// Strahl: Mitte hell, Ränder weich; helle Energiepulse rasen vom Maul weg, der Rand franst flackernd aus
const BEAM_FS = /* glsl */`
uniform float uTime, uLen, uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float d = vUv.y * uLen;
  float edge = abs(dot(vN, vV));
  float fray = 0.75 + 0.25 * sin(vUv.x * 40.0 + d * 0.3 - uTime * 70.0) * sin(vUv.x * 17.0 - uTime * 23.0);
  float core = pow(edge, 1.4 + 0.8 * (1.0 - fray));
  float wave = 0.7 + 0.3 * sin(d * 0.22 - uTime * 46.0) * sin(d * 0.05 - uTime * 11.0);
  float pulse = pow(max(0.0, sin(d * 0.06 - uTime * 32.0)), 18.0);           // helle Pakete, die nach vorn rasen
  float start = smoothstep(0.0, 6.0, d);
  vec3 col = uColor * core * wave + vec3(0.8, 0.9, 1.0) * pulse * core * 1.6;
  gl_FragColor = vec4(col * start * uAlpha, 1.0);
}`;

// Spiralband um den Strahl: die Geometrie ist ein flaches Band (x = Seite -1/1, z = 0..1), der Vertex-Shader wickelt
// es mit uLen Metern Länge als Schraube um die Achse und lässt es rotieren
const SPIRAL_VS = /* glsl */`
uniform float uTime, uLen, uR, uPhase;
varying float vZ;
varying float vSide;
void main() {
  float z = position.z * uLen;
  float a = z * 0.075 - uTime * 14.0 + uPhase;
  float r = uR * (0.75 + 0.25 * sin(z * 0.04 - uTime * 6.0));
  vec3 c = vec3(cos(a) * r, sin(a) * r, z);
  vec3 t = vec3(-sin(a), cos(a), 0.0);
  vZ = z;
  vSide = position.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(c + t * position.x * 1.3, 1.0);
}`;
const SPIRAL_FS = /* glsl */`
uniform float uTime, uAlpha;
uniform vec3 uColor;
varying float vZ;
varying float vSide;
void main() {
  float soft = 1.0 - vSide * vSide;
  float flick = 0.6 + 0.4 * sin(vZ * 0.5 - uTime * 50.0);
  gl_FragColor = vec4(uColor * soft * flick * smoothstep(0.0, 10.0, vZ) * uAlpha, 1.0);
}`;

// Leuchtkugel: uPow <= 1 -> Mitte hell (Einschlag), sonst heller Rand (Fresnel, Kernpuls-Welle)
const RIM_FS = /* glsl */`
uniform float uAlpha, uPow;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(vN, vV));
  float a = uPow <= 1.0 ? pow(1.0 - f, 1.5) : pow(f, uPow);
  gl_FragColor = vec4(uColor * a * uAlpha, 1.0);
}`;

function additive(fs, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: fs, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export class Beam {
  // spiral/sparks: Spiralbänder und Funken (Godzillas Strahl); der zurückgeworfene Strahl der Super-X2 kommt ohne aus
  constructor(scene, { spiral = true, sparks = true } = {}) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    geo.rotateX(Math.PI / 2).translate(0, 0, 0.5);       // Achse 0..1 entlang +Z
    this.group = new THREE.Group();
    this.layers = [
      [4.6, new THREE.Color(0.12, 0.35, 1.0).multiplyScalar(1.4)],
      [1.6, new THREE.Color(0.7, 0.88, 1.0).multiplyScalar(2.4)],
    ].map(([r, c]) => {
      const m = new THREE.Mesh(geo, additive(BEAM_FS, {
        uTime: { value: 0 }, uLen: { value: 1 }, uAlpha: { value: 1 }, uColor: { value: c } }));
      m.userData.r = r;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
    // zwei gegenläufig versetzte Spiralbänder
    this.spirals = [];
    if (spiral) {
      const N = 160, pos = [], idx = [];
      for (let i = 0; i <= N; i++) pos.push(-1, 0, i / N, 1, 0, i / N);
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sg.setIndex(idx);
      this.spirals = [0, Math.PI].map(ph => {
        const m = new THREE.Mesh(sg, new THREE.ShaderMaterial({
          vertexShader: SPIRAL_VS, fragmentShader: SPIRAL_FS, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          uniforms: { uTime: { value: 0 }, uLen: { value: 1 }, uR: { value: 6.5 }, uPhase: { value: ph }, uAlpha: { value: 1 },
            uColor: { value: new THREE.Color(0.35, 0.65, 1.6) } } }));
        m.frustumCulled = false;
        this.group.add(m);
        return m;
      });
    }
    this.impact = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12),
      additive(RIM_FS, { uAlpha: { value: 1 }, uPow: { value: 1 }, uColor: { value: new THREE.Color(0.5, 0.75, 1.6) } }));
    // Druckring am Einschlag und Lichtblitz am Maul
    this.ring = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12),
      additive(RIM_FS, { uAlpha: { value: 1 }, uPow: { value: 4 }, uColor: { value: new THREE.Color(0.4, 0.7, 1.8) } }));
    this.flare = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10),
      additive(RIM_FS, { uAlpha: { value: 1 }, uPow: { value: 1 }, uColor: { value: new THREE.Color(0.6, 0.85, 1.8) } }));
    for (const m of [this.impact, this.ring, this.flare]) m.frustumCulled = false;
    this.light = new THREE.PointLight(0x6fa8ff, 0, 320, 1);
    this.mouthLight = new THREE.PointLight(0x7fb8ff, 0, 160, 1);
    this.group.visible = this.impact.visible = this.ring.visible = this.flare.visible = false;
    scene.add(this.group, this.impact, this.ring, this.flare, this.light, this.mouthLight);
    // Funken: eigener Partikel-Pool, main.js aktualisiert ihn (braucht die Kamera)
    this.sparks = sparks ? new Particles(scene, 400, { ramp: [[0.75, 0.9, 1.6], [0.1, 0.3, 1.0]], additive: true, opacity: 0.95, grow: -0.6 }) : null;
    this.len = 0;
    this.time = 0;
    this.ringT = 0;
    this.end = new THREE.Vector3();
  }

  // Farben (Kern, Hülle, Einschlag), z. B. für den goldenen Rückstrahl der Super-X2
  setColors(outer, core, impact) {
    this.layers[0].material.uniforms.uColor.value.setRGB(...outer);
    this.layers[1].material.uniforms.uColor.value.setRGB(...core);
    for (const m of [this.impact, this.ring, this.flare]) m.material.uniforms.uColor.value.setRGB(...impact);
    for (const m of this.spirals) m.material.uniforms.uColor.value.setRGB(...outer);
  }

  // from/dir in Weltkoordinaten, maxLen = Abstand bis zum ersten Hindernis
  update(dt, on, from, dir, maxLen) {
    this.time += dt;
    this.len = on ? Math.min(maxLen, this.len + dt * 1800) : 0;
    const vis = on && this.len > 0.5;
    this.group.visible = this.impact.visible = this.flare.visible = vis;
    this.light.intensity = vis ? 900 * (0.8 + 0.2 * Math.random()) : 0;
    this.mouthLight.intensity = vis ? 500 : 0;
    if (!vis) { this.ring.visible = false; return null; }
    const flick = 0.85 + 0.15 * Math.sin(this.time * 63.0);
    this.group.position.copy(from);
    this.group.lookAt(this.end.copy(from).add(dir));
    for (const m of this.layers) {
      const r = m.userData.r * flick;
      m.scale.set(r, r, this.len);
      m.material.uniforms.uTime.value = this.time;
      m.material.uniforms.uLen.value = this.len;
    }
    for (const m of this.spirals) { m.material.uniforms.uTime.value = this.time; m.material.uniforms.uLen.value = this.len; }
    this.end.copy(from).addScaledVector(dir, this.len);
    const hit = this.len >= maxLen - 1;
    this.impact.visible = hit;
    this.impact.position.copy(this.end);
    this.impact.scale.setScalar(18 + 9 * Math.random());
    // Druckring: wächst immer wieder vom Einschlag aus
    this.ringT = (this.ringT + dt * 2.2) % 1;
    this.ring.visible = hit;
    this.ring.position.copy(this.end);
    this.ring.scale.setScalar(10 + 38 * this.ringT);
    this.ring.material.uniforms.uAlpha.value = 1 - this.ringT;
    this.flare.position.copy(from);
    this.flare.scale.setScalar(7 + 3 * Math.random());
    if (this.sparks) {
      for (let k = 0; k < 3; k++) {                      // Funken entlang des Strahls
        const t = Math.random() * this.len;
        this.sparks.emit(from.x + dir.x * t, from.y + dir.y * t, from.z + dir.z * t, 1, { spread: 3, up: 4, out: 10, size: 4, life: 0.5 });
      }
      if (hit) this.sparks.emit(this.end.x, this.end.y, this.end.z, 6, { spread: 4, up: 14, out: 26, size: 6, life: 0.9 });
    }
    this.light.position.copy(this.end).addScaledVector(dir, -12);
    this.mouthLight.position.copy(from);
    return hit ? this.end : null;
  }
}

export class Shockwave {
  constructor(scene) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16),
      additive(RIM_FS, { uAlpha: { value: 0 }, uPow: { value: 6 }, uColor: { value: new THREE.Color(0.35, 0.65, 1.8) } }));
    this.mesh.visible = false;
    this.light = new THREE.PointLight(0x7fb8ff, 0, 500, 1);
    scene.add(this.mesh, this.light);
    this.t = -1;
    this.radius = 130;
  }

  fire(pos, radius = 130) {
    this.t = 0;
    this.radius = radius;
    this.mesh.position.copy(pos);
    this.light.position.copy(pos);
    this.mesh.visible = true;
  }

  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / 0.75);
    const e = 1 - (1 - k) ** 3;
    this.mesh.scale.setScalar(6 + this.radius * e);
    this.mesh.material.uniforms.uAlpha.value = (1 - k) ** 1.5 * 2.0;
    this.light.intensity = 4000 * (1 - k) ** 2;
    if (k >= 1) { this.t = -1; this.mesh.visible = false; this.light.intensity = 0; }
  }
}

// ---------- Partikel: ein Points-Objekt mit Pool, weiche runde Punkte, wachsen und verblassen ----------
// Staub und Rauch teilen sich einen Pool (Farbe pro Partikel), Feuer ist ein eigener additiver Pool mit Farbverlauf.
const DUST_VS = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale, uMaxPx;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uScale / -mv.z, uMaxPx);   // Deckel gegen Overdraw auf schwachen GPUs
  gl_Position = projectionMatrix * mv;
  vA = aAlpha;
  vC = aColor;
}`;
const DUST_FS = /* glsl */`
varying float vA;
varying vec3 vC;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = (1.0 - d) * (1.0 - d);
  gl_FragColor = vec4(vC, a * vA);
}`;

export class Particles {
  // ramp: [Startfarbe, Endfarbe] über die Lebenszeit (sonst feste Farbe je Partikel), additive: leuchtend (Feuer)
  constructor(scene, max = 1000, { color = [0.36, 0.34, 0.31], ramp = null, additive = false, opacity = 0.65, grow = 1.4 } = {}) {
    this.max = max;
    this.color = color;
    this.ramp = ramp;
    this.opacity = opacity;
    this.growth = grow;
    this.col = new Float32Array(max * 3);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.base = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    for (const [name, arr, n] of [['position', this.pos, 3], ['aSize', this.size, 1], ['aAlpha', this.alpha, 1], ['aColor', this.col, 3]]) {
      geo.setAttribute(name, new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage));
    }
    this.mat = new THREE.ShaderMaterial({
      vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 500 }, uMaxPx: { value: 120 } },
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, n, { spread = 10, up = 5, out = 4, size = 18, life = 3.5, color = this.color } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next++ % this.max, j = i * 3;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      this.pos[j] = x + Math.cos(a) * r; this.pos[j + 1] = y + Math.random() * 3; this.pos[j + 2] = z + Math.sin(a) * r;
      this.vel[j] = Math.cos(a) * out * (0.5 + Math.random());
      this.vel[j + 1] = up * (0.4 + Math.random());
      this.vel[j + 2] = Math.sin(a) * out * (0.5 + Math.random());
      this.base[i] = size * (0.6 + 0.8 * Math.random());
      this.life[i] = life * (0.7 + 0.6 * Math.random());
      this.age[i] = 0;
      const v = 0.85 + 0.3 * Math.random();
      for (let c = 0; c < 3; c++) this.col[j + c] = color[c] * v;
    }
  }

  update(dt, camera, viewHeight) {
    const drag = Math.exp(-1.4 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const k = (this.age[i] += dt) / this.life[i];
      if (k >= 1) { this.life[i] = 0; this.alpha[i] = 0; continue; }
      const j = i * 3;
      this.vel[j] *= drag; this.vel[j + 1] *= drag; this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.base[i] * (1 + this.growth * k);
      this.alpha[i] = Math.min(1, k * 8) * (1 - k) ** 1.5 * this.opacity;
      if (this.ramp) {
        const [a, b] = this.ramp;
        for (let c = 0; c < 3; c++) this.col[j + c] = a[c] + (b[c] - a[c]) * k;
      }
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = g.aColor.needsUpdate = true;
    this.mat.uniforms.uScale.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.mat.uniforms.uMaxPx.value = viewHeight * 0.18;
  }
}

// ---------- Trümmer: Betonbrocken aus units.glb, fliegen, prallen einmal ab, schrumpfen weg ----------
export class Debris {
  constructor(scene, meshes, perType = 40) {
    this.ims = meshes.map(src => {
      const im = new THREE.InstancedMesh(src.geometry, src.material, perType);
      im.frustumCulled = false;
      for (let i = 0; i < perType; i++) im.setMatrixAt(i, ZERO);
      scene.add(im);
      return im;
    });
    this.perType = perType;
    this.next = 0;
    this.parts = [];
  }

  emit(pos, n, { speed = 16, size = 2.5, up = 1 } = {}) {
    for (let k = 0; k < n; k++) {
      const slot = this.next++ % (this.perType * this.ims.length);
      const im = this.ims[slot % this.ims.length], idx = Math.floor(slot / this.ims.length);
      this.parts = this.parts.filter(p => p.im !== im || p.idx !== idx);
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + 0.8 * Math.random());
      this.parts.push({
        im, idx, p: pos.clone(), s: size * (0.5 + Math.random()),
        v: new THREE.Vector3(Math.cos(a) * s, speed * up * (0.5 + 0.8 * Math.random()), Math.sin(a) * s),
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        w: 2 + Math.random() * 6, ang: 0, age: 0, life: 3 + Math.random() * 2,
      });
    }
  }

  update(dt) {
    const touched = new Set();
    this.parts = this.parts.filter(d => {
      d.age += dt;
      touched.add(d.im);
      if (d.age >= d.life) { d.im.setMatrixAt(d.idx, ZERO); return false; }
      d.v.y -= 24 * dt;
      d.p.addScaledVector(d.v, dt);
      const floor = d.s * 0.45;
      if (d.p.y < floor) {
        d.p.y = floor;
        if (d.v.y < -2) { d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; d.w *= 0.5; }
        else { d.v.set(0, 0, 0); d.w = 0; }
      }
      d.ang += d.w * dt;
      const s = d.s * Math.min(1, (d.life - d.age) / 0.6);
      _q.setFromAxisAngle(d.axis, d.ang);
      d.im.setMatrixAt(d.idx, _mat.compose(d.p, _q, _s.set(s, s, s)));
      return true;
    });
    for (const im of touched) im.instanceMatrix.needsUpdate = true;
  }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _q = new THREE.Quaternion(), _mat = new THREE.Matrix4(), _s = new THREE.Vector3();

// Blitz: zuckender Zickzack-Strahl mit Nebenarmen als Band, das zur Kamera zeigt (Glühen + heller Kern). Der Pfad wird
// alle paar Hundertstelsekunden neu gewürfelt (Ghidorahs Gravitationsstrahlen).
const LN = 30, BN = 10, BRANCHES = 4;
export class Lightning {
  constructor(scene, color) {
    this.strips = [LN + 1, ...Array(BRANCHES).fill(BN + 1)];
    const total = this.strips.reduce((a, b) => a + b, 0);
    this.pts = Array.from({ length: total }, () => new THREE.Vector3());
    const index = [];
    let o = 0;
    for (const n of this.strips) {
      for (let i = 0; i < n - 1; i++) { const a = (o + i) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      o += n;
    }
    const c = new THREE.Color(...color);
    this.layers = [[13, c.clone().multiplyScalar(1.5), 0.5], [3.6, new THREE.Color(1, 0.97, 0.9).lerp(c, 0.2).multiplyScalar(2.2), 1]]
      .map(([w, col, op]) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 6), 3).setUsage(THREE.DynamicDrawUsage));
        geo.setIndex(index);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
        m.frustumCulled = false;
        m.visible = false;
        m.userData.w = w;
        scene.add(m);
        return m;
      });
    this.reroll = 0;
    this.end = new THREE.Vector3();
  }

  // from/to: Weltpunkte; camera für die Ausrichtung des Bandes
  update(dt, on, from, to, camera) {
    for (const m of this.layers) m.visible = on && Math.random() > 0.08;   // flackert
    if (!on) return;
    this.end.copy(to);
    if ((this.reroll -= dt) <= 0) { this.reroll = 0.045; this.path(from, to); }
    const cam = camera.position, P = this.pts;
    for (const m of this.layers) {
      const arr = m.geometry.attributes.position.array, w = m.userData.w * 0.5;
      let o = 0;
      for (const n of this.strips) {
        for (let i = 0; i < n; i++) {
          const p = P[o + i], q = P[o + Math.min(n - 1, i + 1)], r = P[o + Math.max(0, i - 1)];
          const t = _l1.subVectors(q, r).normalize();
          const side = _l2.subVectors(cam, p).cross(t).normalize().multiplyScalar(w * (n === LN + 1 ? 1 : 0.6) * (1 - 0.5 * i / n));
          const k = (o + i) * 6;
          arr[k] = p.x + side.x; arr[k + 1] = p.y + side.y; arr[k + 2] = p.z + side.z;
          arr[k + 3] = p.x - side.x; arr[k + 4] = p.y - side.y; arr[k + 5] = p.z - side.z;
        }
        o += n;
      }
      m.geometry.attributes.position.needsUpdate = true;
    }
  }

  path(from, to) {
    const dir = _l1.subVectors(to, from), len = dir.length();
    dir.normalize();
    const u = _l2.set(-dir.z, 0, dir.x).normalize(), v = _l3.crossVectors(dir, u);
    const P = this.pts;
    const big = [(Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)];
    for (let i = 0; i <= LN; i++) {
      const t = i / LN, env = Math.sin(Math.PI * t);
      const zig = len * 0.1 * env;
      const a = (big[0] * Math.sin(t * 7) + big[1] * Math.sin(t * 13 + 1) + (Math.random() - 0.5) * 0.5) * zig;
      const b = (big[2] * Math.sin(t * 9 + 2) + big[3] * Math.sin(t * 17) + (Math.random() - 0.5) * 0.5) * zig;
      P[i].copy(from).addScaledVector(dir, len * t).addScaledVector(u, a).addScaledVector(v, b);
    }
    let o = LN + 1;
    for (let k = 0; k < BRANCHES; k++) {
      const s = P[4 + Math.floor(Math.random() * (LN - 8))];
      const bd = _l4.copy(dir).addScaledVector(u, (Math.random() - 0.5) * 2).addScaledVector(v, (Math.random() - 0.5) * 2).normalize();
      const bl = len * (0.08 + Math.random() * 0.12);
      for (let i = 0; i <= BN; i++) {
        const t = i / BN;
        P[o + i].copy(s).addScaledVector(bd, bl * t)
          .addScaledVector(u, (Math.random() - 0.5) * bl * 0.25 * t).addScaledVector(v, (Math.random() - 0.5) * bl * 0.25 * t);
      }
      o += BN + 1;
    }
  }
}
const _l1 = new THREE.Vector3(), _l2 = new THREE.Vector3(), _l3 = new THREE.Vector3(), _l4 = new THREE.Vector3();
