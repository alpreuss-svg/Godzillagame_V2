// Atomstrahl und Kernpuls: additive Shader ohne Postprocessing (günstig für schwache GPUs)
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
