// Bodenschäden: eine Schadenskarte über die ganze Stadt (Canvas, additiv bemalt), die der Boden-Shader liest.
// Kanäle: R = Ruß/Brandspuren, G = Staub und Splitt (lässt Schutt in den Boden übergehen), B = Krater und Risse.
import * as THREE from 'three';

export class GroundScars {
  constructor(size, res = 1024) {
    this.size = size;
    this.res = res;
    const c = this.canvas = document.createElement('canvas');
    c.width = c.height = res;
    this.g = c.getContext('2d');
    this.g.fillStyle = '#000';
    this.g.fillRect(0, 0, res, res);
    this.g.globalCompositeOperation = 'lighter';     // Schäden summieren sich je Kanal
    this.tex = new THREE.CanvasTexture(c);
    this.tex.flipY = false;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.uniforms = { uScars: { value: this.tex }, uScarSize: { value: size } };
    this.dirty = false;
    this.wait = 0;
  }

  px(v) { return (v / this.size + 0.5) * this.res; }

  // weicher Fleck; rgb = Stärke je Kanal 0..1
  blob(x, z, r, [R, G, B], core = 0.3) {
    const g = this.g, cx = this.px(x), cy = this.px(z), rp = Math.max(1.5, r / this.size * this.res);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rp);
    const c = `${R * 255 | 0},${G * 255 | 0},${B * 255 | 0}`;
    grad.addColorStop(0, `rgba(${c},1)`);
    grad.addColorStop(core, `rgba(${c},0.85)`);
    grad.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grad;
    g.fillRect(cx - rp, cy - rp, rp * 2, rp * 2);
    this.dirty = true;
  }

  // eingestürztes Gebäude: Staub- und Splittfeld weit über die Grundfläche hinaus, Risse, etwas Ruß
  collapse(x, z, r) {
    this.blob(x, z, r * 2.4, [0.05, 0.55, 0], 0.35);
    this.blob(x, z, r * 1.3, [0.25, 0.3, 0.35], 0.5);
  }

  // umgestürzter Turm: Schneise entlang der Fallrichtung
  line(x, z, dir, len, w) {
    for (let s = 0; s <= len; s += w * 0.5) this.collapse(x + dir.x * s, z + dir.z * s, w * 0.5);
  }

  scorch(x, z, r, k = 1) { this.blob(x, z, r, [0.5 * k, 0.05 * k, 0.15 * k], 0.4); }

  // Atomstrahl am Boden: heiße, glühende Spur (R nahe 1)
  burn(x, z, r) { this.blob(x, z, r, [1, 0, 0.2], 0.5); }

  // höchstens viermal pro Sekunde hochladen (1024² Pixel)
  update(dt) {
    this.wait -= dt;
    if (this.dirty && this.wait <= 0) { this.tex.needsUpdate = true; this.dirty = false; this.wait = 0.25; }
  }
}

// Boden-Shader: Asphalt-Textur plus Schadenskarte in Weltkoordinaten
export function patchGround(mat, scars) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, scars.uniforms);
    sh.vertexShader = 'varying vec2 vGZ;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vGZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = /* glsl */`
uniform sampler2D uScars;
uniform float uScarSize;
varying vec2 vGZ;
float gzHot = 0.0;
float gzH2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gzN2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gzH2(i), gzH2(i + vec2(1, 0)), f.x), mix(gzH2(i + vec2(0, 1)), gzH2(i + vec2(1, 1)), f.x), f.y);
}
` + sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
{
  vec3 sc = texture2D(uScars, vGZ / uScarSize + 0.5).rgb;
  float grit = gzN2(vGZ * 1.9) * 0.6 + gzN2(vGZ * 6.0) * 0.4;
  float big = gzN2(vGZ * 0.12);
  // Staub und Splitt: staubiges Grau-Braun mit Körnung, franst am Rand unregelmäßig aus
  float dust = smoothstep(0.1, 0.6, sc.g + (big - 0.5) * 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.27, 0.235) * (0.6 + 0.8 * grit), dust * 0.95);
  // Krater: dunkle Mulde, verästelte Risse rundherum
  float crack = 1.0 - smoothstep(0.0, 0.035, abs(gzN2(vGZ * 0.22) - 0.5)) ;
  crack = max(crack, 1.0 - smoothstep(0.0, 0.03, abs(gzN2(vGZ * 0.6 + 9.0) - 0.5)));
  float crater = clamp(sc.b, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - crater * 0.55 - crack * smoothstep(0.05, 0.4, sc.b) * 0.6;
  // Ruß
  diffuseColor.rgb *= 1.0 - smoothstep(0.0, 1.0, sc.r) * 0.85;
  gzHot = smoothstep(0.8, 1.0, sc.r) * (0.6 + 0.4 * grit);                  // frische Brandspur glüht
}`).replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * gzHot * 1.2;`);
  };
  mat.customProgramCacheKey = () => 'gz-ground';
}

// ---------- Decals: scharfe Details flach auf dem Boden (Einschläge, Rissnetze), je Art ein InstancedMesh ----------
export class Decals {
  constructor(scene) {
    this.kinds = {
      impact: [this.pool(scene, impactTexture(), 160), this.pool(scene, impactTexture(), 160)],   // zwei Varianten
      crack: this.pool(scene, crackTexture(), 200),
    };
  }

  pool(scene, map, n) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.count = 0;
    im.frustumCulled = false;
    im.receiveShadow = true;
    im.renderOrder = 1;
    scene.add(im);
    return { im, next: 0, n };
  }

  // rot: Drehung um die Hochachse, size in m
  add(kind, x, z, rot, size) {
    let p = this.kinds[kind];
    if (Array.isArray(p)) p = p[Math.random() * p.length | 0];
    const i = p.next++ % p.n;
    _dq.setFromAxisAngle(_up, rot);
    p.im.setMatrixAt(i, _dm.compose(_dv.set(x, 0.06, z), _dq, _ds.set(size, 1, size)));
    p.im.count = Math.min(p.n, Math.max(p.im.count, i + 1));
    p.im.instanceMatrix.needsUpdate = true;
  }
}
const _up = new THREE.Vector3(0, 1, 0), _dq = new THREE.Quaternion(), _dm = new THREE.Matrix4();
const _dv = new THREE.Vector3(), _ds = new THREE.Vector3();

function canvasTex(draw, S = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// gezackte Risslinie, verzweigt sich gelegentlich
function crackLine(g, x, y, ang, len, w, depth = 0) {
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x, y);
  const n = 8;
  for (let i = 0; i < n; i++) {
    ang += (Math.random() - 0.5) * 0.9;
    x += Math.cos(ang) * len / n; y += Math.sin(ang) * len / n;
    g.lineTo(x, y);
    if (depth < 2 && Math.random() < 0.18) { g.stroke(); crackLine(g, x, y, ang + (Math.random() - 0.5) * 2, len * 0.45, w * 0.6, depth + 1); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
  }
  g.stroke();
}

// Einschlag im Asphalt (formlos, keine Fußform): unregelmäßiger Staubkranz, zersplitterte Platten in der Mitte,
// verästelte Risse nach außen
function impactTexture() {
  return canvasTex((g, S) => {
    const c = S / 2, R = Math.random;
    for (let i = 0; i < 5; i++) {                       // Staubkranz aus versetzten Wolken
      const x = c + (R() - 0.5) * S * 0.25, y = c + (R() - 0.5) * S * 0.25, r = S * (0.25 + R() * 0.22);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(150,140,126,0.35)'); gr.addColorStop(1, 'rgba(130,122,110,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
    g.strokeStyle = 'rgba(12,11,10,0.8)';
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, d = R() * S * 0.18;
      crackLine(g, c + Math.cos(a) * d, c + Math.sin(a) * d, a + (R() - 0.5), S * (0.08 + R() * 0.12), 1.8);
    }
    for (let i = 0; i < 26; i++) {                      // Asphaltschollen: dunkle Splitter mit hellem Bruchrand
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * S * 0.16, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      const r = S * (0.02 + R() * 0.04);
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const b = k / 5 * Math.PI * 2 + R() * 0.8, rr = r * (0.6 + R() * 0.7);
        k ? g.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr) : g.moveTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr);
      }
      g.closePath();
      g.fillStyle = `rgba(${10 + R() * 25 | 0},${9 + R() * 22 | 0},${8 + R() * 18 | 0},0.92)`;
      g.fill();
      g.strokeStyle = 'rgba(120,112,100,0.5)'; g.lineWidth = 1; g.stroke();
    }
    g.strokeStyle = 'rgba(12,11,10,0.8)';
  });
}

// Einsturzstelle: Staub, unregelmäßige Ruß- und Splittflecken, viele kurze Risse (lange Linien wirken wie Spinnenbeine)
function crackTexture() {
  return canvasTex((g, S) => {
    const c = S / 2, R = Math.random;
    for (let i = 0; i < 7; i++) {
      const x = c + (R() - 0.5) * S * 0.3, y = c + (R() - 0.5) * S * 0.3, r = S * (0.2 + R() * 0.25);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(115,107,96,0.4)'); gr.addColorStop(1, 'rgba(100,94,86,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
    for (let i = 0; i < 18; i++) {                       // Ruß- und Splittflecken
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * S * 0.3, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      const r = S * (0.02 + R() * 0.05);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(14,13,12,0.6)'); gr.addColorStop(1, 'rgba(14,13,12,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(14,13,12,0.6)';
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * S * 0.32;
      crackLine(g, c + Math.cos(a) * d, c + Math.sin(a) * d, R() * Math.PI * 2, S * (0.04 + R() * 0.08), 1.4);
    }
  }, 512);
}
