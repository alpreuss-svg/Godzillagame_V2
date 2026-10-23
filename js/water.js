// Wasser (Bucht und Flüsse): eigener Shader statt flacher Platte – Wellen aus mehreren laufenden Schichten,
// Fresnel-Spiegelung des Nachthimmels, Mondglitzern, gespiegelte Hafenlichter in Ufernähe, Schaum an der Uferlinie,
// Regentropfen-Ringe und Wellenringe/Schaum dort, wo Monster durchs Wasser laufen (splash, wade).
import * as THREE from 'three';

const MAX_RIPPLES = 16;

const VS = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */`
uniform float uTime, uFogDensity, uShoreMode, uShoreA, uShoreB;
uniform vec3 uCam, uMoonDir, uFogColor;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform vec4 uWaders[4];
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// Wellenhöhe aus laufenden Schichten (Ableitung numerisch)
float waves(vec2 p) {
  float t = uTime;
  float h = 0.0;
  h += 0.55 * sin(dot(p, vec2(0.021, 0.034)) + t * 0.9);
  h += 0.35 * sin(dot(p, vec2(-0.043, 0.019)) + t * 1.3);
  h += 0.22 * sin(dot(p, vec2(0.071, -0.052)) + t * 1.9);
  h += 0.5 * vnoise(p * 0.09 + vec2(t * 0.25, t * 0.18));
  h += 0.25 * vnoise(p * 0.23 - vec2(t * 0.4, -t * 0.3));
  return h;
}
void main() {
  vec2 p = vWorld.xz;
  // Uferabstand: Bucht (Ufer bei z = uShoreA), Fluss (Ufer bei z = uShoreA und uShoreB)
  float shore = uShoreMode < 0.5 ? p.y - uShoreA : min(p.y - uShoreA, uShoreB - p.y);
  float e = 0.8;
  float h0 = waves(p);
  vec3 n = normalize(vec3(-(waves(p + vec2(e, 0)) - h0) / e * 1.6, 1.0, -(waves(p + vec2(0, e)) - h0) / e * 1.6));
  // Wellenringe (Spritzer, Schritte im Wasser) und Schaum
  float foam = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0) continue;
    float d = distance(p, r.xy);
    float front = age * 14.0;
    float ring = exp(-pow((d - front) / (3.0 + age * 2.0), 2.0)) * exp(-age * 0.9) * r.w;
    n.xz += normalize(p - r.xy + 0.001) * ring * 0.8;
    foam += ring * 0.6 + exp(-d / (6.0 + age * 6.0)) * exp(-age * 2.5) * r.w * 0.8;
  }
  // Monster im Wasser: Schaumring um den Körper, Wellen darum
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaders[i];
    if (w.w <= 0.0) continue;
    float d = distance(p, w.xy) - w.z;
    float ring = exp(-pow(d / 6.0, 2.0)) * w.w;
    foam += ring * smoothstep(0.35, 0.9, vnoise(p * 0.35 + vec2(uTime * 1.5, -uTime)));   // aufgerissener Schaum
    n.xz += normalize(p - w.xy + 0.001) * sin(d * 0.35 - uTime * 5.0) * exp(-max(d, 0.0) / 30.0) * 0.25 * w.w;
  }
  // Regen: kleine Ringe in Zellen
  vec2 cell = floor(p / 5.0), cp = fract(p / 5.0) - 0.5;
  float ph = fract(uTime * 0.9 + hash(cell));
  float rr = length(cp + (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5);
  vec3 nSoft = normalize(n);                                 // fürs Mondglitzern ohne Regenkörnung
  n.xz += (cp / max(rr, 0.01)) * exp(-pow((rr - ph * 0.45) * 30.0, 2.0)) * (1.0 - ph) * 0.1;
  n = normalize(n);

  vec3 V = normalize(uCam - vWorld);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(vec3(0.035, 0.05, 0.085), vec3(0.09, 0.11, 0.16), pow(1.0 - max(R.y, 0.0), 3.0));
  vec3 deep = mix(vec3(0.008, 0.025, 0.04), vec3(0.02, 0.05, 0.06), clamp(1.0 - shore / 60.0, 0.0, 1.0));
  vec3 col = mix(deep, sky, fres);
  // Mondglitzern
  vec3 Rs = reflect(-V, normalize(mix(vec3(0.0, 1.0, 0.0), nSoft, 0.6)));
  float glint = pow(max(dot(Rs, uMoonDir), 0.0), 90.0);
  col += vec3(0.5, 0.6, 0.85) * glint * 0.9;
  // gespiegelte Hafenlichter: warme, von den Wellen verzerrte Streifen in Ufernähe
  float lx = p.x * 0.03 + n.x * 1.5;
  float lamp = smoothstep(0.7, 0.92, vnoise(vec2(lx, 0.5))) * smoothstep(0.6, 1.0, vnoise(vec2(p.x * 0.013, 2.0)) + 0.4);
  float near = exp(-max(shore, 0.0) / (uShoreMode < 0.5 ? 140.0 : 40.0));
  float shimmer = 0.75 + 0.25 * vnoise(vec2(lx * 2.0, p.y * 0.03 - uTime * 0.4));
  col += vec3(1.0, 0.62, 0.3) * lamp * near * shimmer * 0.22;
  // Schaum an der Uferlinie und um Monster
  float shoreFoam = smoothstep(9.0, 0.0, shore + 4.0 * vnoise(p * 0.05)) * smoothstep(0.3, 0.8, vnoise(p * 0.25 + vec2(uTime * 0.7, 0.0)));
  foam = clamp(foam + shoreFoam, 0.0, 1.2);
  col = mix(col, vec3(0.42, 0.47, 0.52), foam * 0.55);
  // Nebel wie in der Szene
  float dist = distance(uCam, vWorld);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  constructor(scene, city, moonOfs) {
    this.city = city;
    this.time = 0;
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
    this.waders = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0));
    this.next = 0;
    this.mats = [];
    const fog = scene.fog;
    const make = (mode, a, b) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS,
        uniforms: {
          uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uMoonDir: { value: moonOfs.clone().normalize() },
          uFogColor: { value: fog.color }, uFogDensity: { value: fog.density },
          uShoreMode: { value: mode }, uShoreA: { value: a }, uShoreB: { value: b },
          uRipples: { value: this.ripples }, uWaders: { value: this.waders },
        },
      });
      this.mats.push(m);
      return m;
    };
    // Kaimauern: Betonkante entlang der Ufer (sonst endet die Stadt mit einer harten, flachen Linie)
    const quay = new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.9 });
    const wall = (w, z) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 3), quay); q.position.set(0, 0.6, z); q.receiveShadow = true; scene.add(q); };
    wall(city.groundSize, city.bayZ - 1.2);
    for (const r of city.rivers) { wall(city.groundSize, r.z0 - 1.2); wall(city.groundSize, r.z1 + 1.2); }
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000), make(0, city.bayZ, 0));
    bay.rotation.x = -Math.PI / 2;
    bay.position.set(0, 0.3, city.bayZ + 1000);
    scene.add(bay);
    for (const r of city.rivers) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(city.groundSize, r.z1 - r.z0), make(1, r.z0, r.z1));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.35, (r.z0 + r.z1) / 2);
      scene.add(m);
    }
  }

  // Wassertiefe an einem Punkt (0 an Land): die Bucht fällt vom Ufer flach ab, Flüsse sind in der Mitte am tiefsten
  depth(x, z) {
    const c = this.city;
    if (z > c.bayZ) return Math.min(20, (z - c.bayZ) * 0.1);
    for (const r of c.rivers) if (z > r.z0 && z < r.z1) return Math.min(9, Math.min(z - r.z0, r.z1 - z) * 0.3);
    return 0;
  }

  // Wellenring an einer Stelle (amp ~ 0,3 Schritt … 1,5 großer Einschlag)
  splash(x, z, amp = 1) {
    if (this.depth(x, z) <= 0.2) return false;
    this.ripples[this.next++ % MAX_RIPPLES].set(x, z, this.time, amp);
    return true;
  }

  // Monster, die gerade im Wasser stehen: [{x, z, r, k}] (Radius, Stärke), höchstens 4
  setWaders(list) {
    this.waders.forEach((w, i) => { const o = list[i]; if (o) w.set(o.x, o.z, o.r, o.k); else w.w = 0; });
  }

  update(dt, camera) {
    this.time += dt;
    for (const m of this.mats) { m.uniforms.uTime.value = this.time; m.uniforms.uCam.value.copy(camera.position); }
  }
}
