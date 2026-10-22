// Gebäude-Shader (Patch der Fassadenmaterialien aus city.glb):
// - Durchsicht-Kreis: Fassaden zwischen Kamera und Godzilla werden gerastert ausgeblendet
// - Schaden pro Instanz: Delle um den Trefferpunkt, Ruß, Löcher mit dunklem Inneren, Glutränder, Fenster erlöschen
// - Knicken: beim Kippen dreht sich der obere Teil eines Turms zusätzlich um eine Bruchkante
// - Schuttmodus: verkohlte Flecken und verglimmende Glut
//
// Instanz-Attribute (InstancedBufferAttribute, je Gebäudetyp geteilt):
//   aDmg = (Schaden 0..1+, Trefferpunkt x, y, z in Gebäudekoordinaten)
//   aFx  = (Modus/Fortschritt: -1 = Schutt, Bruchhöhe, Knickwinkel, Winkel der Knickachse)
import * as THREE from 'three';

export const seeThrough = {
  uCam: { value: new THREE.Vector3() },
  uFocus: { value: new THREE.Vector3() },
  uSeeR: { value: 85 },        // Radius des Kreises auf Höhe von Godzilla (m)
  uTime: { value: 0 },
};

const VERT_HEAD = /* glsl */`
attribute vec4 aDmg;
attribute vec4 aFx;
varying vec4 vDmg;
varying vec4 vFx;
varying vec3 vLocal;
varying vec3 vWorld;
float gzHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
vec3 gzRot(vec3 v, vec3 k, float a) {          // Rodrigues, wie Matrix4.makeRotationAxis
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
`;

const VERT_BODY = /* glsl */`
#include <begin_vertex>
vDmg = aDmg; vFx = aFx; vLocal = position;
if (aFx.x > -0.5 && aDmg.x > 0.0) {
  // Delle: Wände um den Trefferpunkt werden zur Gebäudeachse gedrückt und zerbröseln leicht
  float r = 10.0 + 22.0 * min(aDmg.x, 1.0);
  float near = 1.0 - smoothstep(0.0, r, distance(position, aDmg.yzw));
  vec2 inward = -normalize(position.xz + vec2(1e-3));
  float d = min(aDmg.x, 1.2);
  transformed.xz += inward * near * d * 3.5;
  transformed += (vec3(gzHash(position), gzHash(position.yzx), gzHash(position.zxy)) - 0.5) * near * d * 2.4;
}
if (aFx.z > 0.0 && transformed.y > aFx.y) {
  vec3 k = vec3(cos(aFx.w), 0.0, sin(aFx.w));
  transformed = gzRot(transformed - vec3(0.0, aFx.y, 0.0), k, aFx.z) + vec3(0.0, aFx.y, 0.0);
}
vec4 gzW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
gzW = instanceMatrix * gzW;
#endif
vWorld = (modelMatrix * gzW).xyz;
`;

const FRAG_HEAD = /* glsl */`
uniform vec3 uCam, uFocus;
uniform float uSeeR, uTime;
varying vec4 vDmg;
varying vec4 vFx;
varying vec3 vLocal;
varying vec3 vWorld;
float gzH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float gzNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gzH(i), gzH(i + vec3(1, 0, 0)), f.x), mix(gzH(i + vec3(0, 1, 0)), gzH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gzH(i + vec3(0, 0, 1)), gzH(i + vec3(1, 0, 1)), f.x), mix(gzH(i + vec3(0, 1, 1)), gzH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float gzBayer(vec2 p) {                        // 4x4-Raster für weiches Ausblenden ohne Transparenz-Sortierung
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
float gzMask;    // < 0: Loch, kleine Werte: Rand
float gzBurn;
float gzEmber;
float gzLights;
`;

const FRAG_CLIP = /* glsl */`
#include <clipping_planes_fragment>
{
  // Durchsicht: Kegel mit Spitze an der Kamera -> der Kreis ist auf dem Bildschirm immer gleich groß
  vec3 cf = uFocus - uCam;
  float t = dot(vWorld - uCam, cf) / dot(cf, cf);
  if (t > 0.05 && t < 0.97) {
    float dd = distance(vWorld, uCam + cf * t) / (uSeeR * t);
    if (dd < 1.0 && smoothstep(0.6, 1.0, dd) < gzBayer(gl_FragCoord.xy)) discard;
  }
  gzBurn = 0.0; gzEmber = 0.0; gzMask = 1.0; gzLights = 1.0;
  float n = gzNoise(vLocal * 0.16) * 0.65 + gzNoise(vLocal * 0.55 + 7.0) * 0.35;
  if (vFx.x < -0.5) {
    // Schutt (Modell ist nur 1x1 groß, darum Rauschen in Weltkoordinaten): verkohlte Flecken und Glutnester,
    // die mit vDmg.x (1 -> 0,12) verglimmen
    float w = gzNoise(vWorld * 0.22) * 0.7 + gzNoise(vWorld * 0.8) * 0.3;
    gzBurn = smoothstep(0.5, 0.7, w) * 0.7;
    gzEmber = (1.0 - smoothstep(0.0, 0.05, abs(w - 0.64))) * vDmg.x;
  } else if (vDmg.x > 0.01) {
    float d = vDmg.x;
    // am Einschlag: Delle, Löcher, Ruß
    float r = distance(vLocal, vDmg.yzw) / (6.0 + 20.0 * min(d, 1.0));
    gzMask = r - min(d, 1.0) * 0.95 + (n - 0.5) * 0.7;
    if (d > 0.3 && gzMask < -0.2) discard;                                   // Loch
    gzBurn = 1.0 - smoothstep(-0.2, 0.45, gzMask);
    gzEmber = (1.0 - smoothstep(0.0, 0.07, abs(gzMask + 0.2))) * smoothstep(0.35, 0.6, d);
    // verteilt über das ganze Gebäude (auch auf der abgewandten Seite sichtbar): Ruß- und Rissflecken, deren
    // Anteil mit dem Schaden wächst, glühende Ränder ab mittlerem Schaden
    float n2 = gzNoise(vLocal * 0.085 + 3.1) * 0.75 + gzNoise(vLocal * 0.3) * 0.25;
    float th = 0.8 - min(d, 1.0) * 0.6;
    gzBurn = max(gzBurn, smoothstep(th, th + 0.04, n2) * 0.9);
    gzEmber = max(gzEmber, (1.0 - smoothstep(0.0, 0.02, abs(n2 - th))) * smoothstep(0.4, 0.7, d));
    gzLights = 1.0 - 0.6 * min(d, 1.0);                                       // Strom fällt nach und nach aus
  }
}
`;

const FRAG_COLOR = /* glsl */`
#include <map_fragment>
diffuseColor.rgb *= mix(1.0, 0.1, gzBurn);
if (!gl_FrontFacing) diffuseColor.rgb *= 0.12;                               // Innenwände durch Löcher sichtbar
`;

const FRAG_EMIT = /* glsl */`
#include <emissivemap_fragment>
totalEmissiveRadiance *= (1.0 - gzBurn) * gzLights * (gl_FrontFacing ? 1.0 : 0.0);   // Fenster erlöschen
float flick = 0.7 + 0.3 * sin(uTime * 9.0 + vLocal.x * 0.7 + vLocal.y * 1.3);
totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * gzEmber * 2.4 * flick;
`;

const patched = new WeakSet();

export function patchBuildingMaterial(mat) {
  if (patched.has(mat)) return;
  patched.add(mat);
  mat.side = THREE.DoubleSide;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, seeThrough);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', FRAG_CLIP)
      .replace('#include <map_fragment>', FRAG_COLOR)
      .replace('#include <emissivemap_fragment>', FRAG_EMIT);
  };
  mat.customProgramCacheKey = () => 'gz-building';
}

// Instanz-Attribute für eine Gruppe von Teilmeshes desselben Typs (alle teilen dieselben Puffer)
export function addInstanceAttributes(geometries, count, fx = [0, 0, 0, 0]) {
  const dmg = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const fxA = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < count; i++) fxA.setXYZW(i, ...fx);
  for (const g of geometries) { g.setAttribute('aDmg', dmg); g.setAttribute('aFx', fxA); }
  return { dmg, fx: fxA };
}
