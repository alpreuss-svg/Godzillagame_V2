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

// ---------- Decals: scharfe Details flach auf dem Boden (Fußabdrücke, Rissnetze), je Art ein InstancedMesh ----------
export class Decals {
  constructor(scene) {
    this.kinds = {
      foot: this.pool(scene, footTexture(), 300),
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

  // rot: Drehung um die Hochachse (Fußabdruck: Godzillas Blickrichtung), size in m
  add(kind, x, z, rot, size) {
    const p = this.kinds[kind];
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

// Fußabdruck (Zehen zeigen nach +Z der Instanz = unten in der Textur): Staubkranz, lange Sohle, drei spitze
// Krallenzehen, Risse im Asphalt
function footTexture() {
  return canvasTex((g, S) => {
    const c = S / 2;
    const ring = g.createRadialGradient(c, c, S * 0.15, c, c, S * 0.5);
    ring.addColorStop(0, 'rgba(160,150,135,0.7)');
    ring.addColorStop(0.55, 'rgba(140,132,118,0.35)');
    ring.addColorStop(1, 'rgba(120,112,100,0)');
    g.fillStyle = ring; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(12,11,10,0.85)';
    for (let i = 0; i < 12; i++) crackLine(g, c, c, i / 12 * Math.PI * 2 + Math.random() * 0.4, S * (0.28 + Math.random() * 0.2), 2.6);
    const dark = (path) => {
      g.save(); g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = S * 0.03;
      g.fillStyle = 'rgba(10,9,8,0.95)'; path(); g.fill(); g.restore();
    };
    dark(() => { g.beginPath(); g.ellipse(c, c - S * 0.04, S * 0.13, S * 0.22, 0, 0, Math.PI * 2); });   // Sohle
    for (const k of [-1, 0, 1]) {                                                                        // Krallenzehen
      const x = c + k * S * 0.1, y = c + S * 0.14, a = k * 0.35;
      dark(() => {
        g.beginPath();
        g.moveTo(x - Math.cos(a) * S * 0.045, y - Math.sin(a) * S * 0.045);
        g.lineTo(x + Math.sin(a) * S * 0.2 * -1 + k * S * 0.03, y + Math.cos(a) * S * 0.2);
        g.lineTo(x + Math.cos(a) * S * 0.045, y + Math.sin(a) * S * 0.045);
        g.closePath();
      });
    }
  });
}

// Rissnetz mit Staub für Einsturzstellen
function crackTexture() {
  return canvasTex((g, S) => {
    const c = S / 2;
    const dust = g.createRadialGradient(c, c, 0, c, c, S * 0.5);
    dust.addColorStop(0, 'rgba(110,102,92,0.5)'); dust.addColorStop(0.7, 'rgba(100,94,86,0.25)'); dust.addColorStop(1, 'rgba(90,85,80,0)');
    g.fillStyle = dust; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(10,9,8,0.85)';
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * S * 0.2;
      crackLine(g, c + Math.cos(a) * r, c + Math.sin(a) * r, a, S * (0.18 + Math.random() * 0.22), 1.8);
    }
  }, 512);
}
