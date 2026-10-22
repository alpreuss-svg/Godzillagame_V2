// Effekte ohne Postprocessing (günstig für schwache GPUs): Atomstrahl, Kernpuls, Staub, Trümmer
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

// Strahl: Mitte hell, Ränder weich, Wellen laufen vom Maul weg
const BEAM_FS = /* glsl */`
uniform float uTime, uLen, uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float core = pow(abs(dot(vN, vV)), 1.6);
  float d = vUv.y * uLen;
  float wave = 0.7 + 0.3 * sin(d * 0.22 - uTime * 46.0) * sin(d * 0.05 - uTime * 11.0);
  float start = smoothstep(0.0, 6.0, d);
  gl_FragColor = vec4(uColor * core * wave * start * uAlpha, 1.0);
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
  constructor(scene) {
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
    this.impact = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12),
      additive(RIM_FS, { uAlpha: { value: 1 }, uPow: { value: 1 }, uColor: { value: new THREE.Color(0.5, 0.75, 1.6) } }));
    this.light = new THREE.PointLight(0x6fa8ff, 0, 320, 1);
    this.mouthLight = new THREE.PointLight(0x7fb8ff, 0, 160, 1);
    this.group.visible = this.impact.visible = false;
    scene.add(this.group, this.impact, this.light, this.mouthLight);
    this.len = 0;
    this.time = 0;
    this.end = new THREE.Vector3();
  }

  // from/dir in Weltkoordinaten, maxLen = Abstand bis zum ersten Hindernis
  update(dt, on, from, dir, maxLen) {
    this.time += dt;
    this.len = on ? Math.min(maxLen, this.len + dt * 1800) : 0;
    const vis = on && this.len > 0.5;
    this.group.visible = this.impact.visible = vis;
    this.light.intensity = vis ? 900 * (0.8 + 0.2 * Math.random()) : 0;
    this.mouthLight.intensity = vis ? 500 : 0;
    if (!vis) return null;
    const flick = 0.85 + 0.15 * Math.sin(this.time * 63.0);
    this.group.position.copy(from);
    this.group.lookAt(this.end.copy(from).add(dir));
    for (const m of this.layers) {
      const r = m.userData.r * flick;
      m.scale.set(r, r, this.len);
      m.material.uniforms.uTime.value = this.time;
      m.material.uniforms.uLen.value = this.len;
    }
    this.end.copy(from).addScaledVector(dir, this.len);
    const hit = this.len >= maxLen - 1;
    this.impact.visible = hit;
    this.impact.position.copy(this.end);
    this.impact.scale.setScalar(14 + 5 * Math.random());
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

// ---------- Staub: ein Points-Objekt mit Partikelpool, weiche runde Punkte, wachsen und verblassen ----------
const DUST_VS = /* glsl */`
attribute float aSize;
attribute float aAlpha;
uniform float uScale, uMaxPx;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uScale / -mv.z, uMaxPx);   // Deckel gegen Overdraw auf schwachen GPUs
  gl_Position = projectionMatrix * mv;
  vA = aAlpha;
}`;
const DUST_FS = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = (1.0 - d) * (1.0 - d);
  gl_FragColor = vec4(uColor, a * vA);
}`;

export class Dust {
  constructor(scene, max = 1000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.base = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    for (const [name, arr, n] of [['position', this.pos, 3], ['aSize', this.size, 1], ['aAlpha', this.alpha, 1]]) {
      geo.setAttribute(name, new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage));
    }
    this.mat = new THREE.ShaderMaterial({
      vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 500 }, uMaxPx: { value: 120 }, uColor: { value: new THREE.Color(0.36, 0.34, 0.31) } },
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, n, { spread = 10, up = 5, out = 4, size = 18, life = 3.5 } = {}) {
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
      this.size[i] = this.base[i] * (1 + 1.4 * k);
      this.alpha[i] = Math.min(1, k * 8) * (1 - k) ** 1.5 * 0.65;
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = true;
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
