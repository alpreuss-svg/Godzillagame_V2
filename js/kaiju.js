// Gemeinsame Helfer für die Monster ab 1992: Falter mit schlagenden Flügeln, Kreisflug um Godzilla, Ausrichten,
// Strahlen (schlanke Beams ohne Licht, Gebäude fangen sie ab), Kugel-Treffer für den Atomstrahl.
import * as THREE from 'three';
import { Beam } from './effects.js';

export const WING_ROOT = [7.5, 1.5, 5];   // Mothra/Battra, aus blender/mothra.py (glTF x, z, -y)
export const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export function makeBeam(scene, outer, core) {
  const b = new Beam(scene);
  b.layers[0].material.uniforms.uColor.value.setRGB(...outer);
  b.layers[1].material.uniforms.uColor.value.setRGB(...core);
  b.impact.material.uniforms.uColor.value.setRGB(...outer);
  b.layers[0].userData.r = 3.0; b.layers[1].userData.r = 1.1;   // schlanker als Godzillas Strahl
  scene.remove(b.light, b.mouthLight);                         // feste Lichtanzahl
  b.t = 0;
  return b;
}

// Ein Strahl, der von einem Punkt zu Godzillas Brust geht; Gebäude dazwischen fangen ihn ab
export function fireBeam(beam, dt, from, g, city, dps, fx) {
  const to = _b.copy(g.position), dir = to.setY(to.y + 48).clone().sub(from);   // Brusthöhe (auch im Wasser)
  const len = dir.length(); dir.normalize();
  const max = city ? Math.min(len, city.raycast(from, dir, len)) : len;
  const end = beam.update(dt, true, from, dir, max);
  if (!end) return;
  if (max >= len - 2) g.takeDamage(dps * dt, end);
  else if (city) city.damage(end.clone(), 12, 120 * dt, from, false, end.y);
  if (Math.random() < dt * 10) fx.fire.emit(end.x, end.y, end.z, 1, { spread: 3, up: 3, out: 5, size: 10, life: 0.5 });
}

// Fliegender Falter (Battra-Falter, Mothra): Körper + zwei Flügel, die um die Längsachse schlagen
export class Moth {
  constructor(gltf, scene, prefix, scale, wingRoot = WING_ROOT) {
    const get = n => gltf.scene.getObjectByName(n);
    this.group = new THREE.Group();
    this.group.scale.setScalar(scale);
    this.group.visible = false;
    scene.add(this.group);
    const body = get(prefix + '_body').clone();
    body.position.set(0, 0, 0);
    this.group.add(body);
    this.wings = [1, -1].map(sx => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * wingRoot[0], wingRoot[1], wingRoot[2]);
      const w = get(prefix + '_wing').clone();
      w.position.set(0, 0, 0);
      w.scale.set(sx, 1, 1);
      w.traverse(o => { if (o.isMesh) o.material.side = THREE.DoubleSide; });
      pivot.add(w);
      this.group.add(pivot);
      pivot.userData.sx = sx;
      return pivot;
    });
    this.t = 0;
  }

  flap(dt, rate, amp, base = 0.1) {
    this.t += dt;
    for (const w of this.wings) w.rotation.z = w.userData.sx * (base + amp * Math.sin(this.t * rate));
  }
}

// Kreisflug um Godzilla in Strahlweite; gibt den Abstand zurück
export function orbit(o, dt, gp, alt, want, speed, spin, city) {
  const p = o.position;
  const dist = Math.hypot(p.x - gp.x, p.z - gp.z);
  const ang = Math.atan2(p.z - gp.z, p.x - gp.x) + spin * dt;
  const r = dist + THREE.MathUtils.clamp(want - dist, -speed * dt, speed * dt);
  p.x = gp.x + Math.cos(ang) * r;
  p.z = gp.z + Math.sin(ang) * r;
  p.y += (alt - p.y) * Math.min(1, dt * 0.8);
  if (city && p.y > 8) {                                        // Hochhäusern ausweichen
    for (const b of city.buildings) {
      if (!b.alive || b.h < p.y + 10) continue;
      const dx = p.x - b.x, dz = p.z - b.z, ox = Math.abs(dx) - b.hw - 30, oz = Math.abs(dz) - b.hd - 30;
      if (ox >= 0 || oz >= 0) continue;
      if (ox > oz) p.x += Math.sign(dx || 1) * -ox; else p.z += Math.sign(dz || 1) * -oz;
    }
  }
  return dist;
}

// Höchstes stehendes Gebäude im Umkreis – Tiefflüge (Sturzflug, Flügelsturm) gehen knapp darüber hinweg, statt an
// Hochhäusern hängen zu bleiben
export function clearAlt(city, x, z, r) {
  let top = 0;
  if (city) for (const b of city.buildings) if (b.alive && b.h > top && Math.abs(b.x - x) < r + b.hw && Math.abs(b.z - z) < r + b.hd) top = b.h;
  return top;
}

export function faceTo(o, gp, dt, rate, pitch = 0) {
  let dy = Math.atan2(gp.x - o.position.x, gp.z - o.position.z) - o.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  o.rotation.y += THREE.MathUtils.clamp(dy, -rate * dt, rate * dt);
  o.rotation.x = pitch;
}

export function sphereHit(c, R, o, d, max) {
  const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
  const t = ox * d.x + oy * d.y + oz * d.z, q = ox * ox + oy * oy + oz * oz - t * t;
  if (t < 0 || q > R * R) return max;
  return Math.min(max, t - Math.sqrt(R * R - q));
}
