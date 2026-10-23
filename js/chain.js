// Biegsame Kette: Schlauch mit Knochenkette (SkinnedMesh), der jedes Bild einer Bezierkurve von der Wurzel zur Spitze
// folgt. Benutzt für Biollantes Ranken und Ghidorahs Hälse und Schwänze.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SEG = 10;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _qi = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
export const ease = t => t * t * (3 - 2 * t);

export function bezier(out, p0, p1, p2, p3, t) {
  const u = 1 - t;
  return out.copy(p0).multiplyScalar(u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
}

// Abstand eines Punktes zur Strecke a-b
export function segDist(p, a, b) {
  const ab = _d.subVectors(b, a), t = THREE.MathUtils.clamp(_c.subVectors(p, a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
  return _c.copy(a).addScaledVector(ab, t).distanceTo(p);
}

export class Chain {
  // head: optionales Objekt an der Spitze (dreht mit dem letzten Knochen); color: [r, g, b] (linear) für Materialien
  // mit Vertexfarben, rings: dunkle Querringe (Schuppen) entlang der Kette
  // ringColor: eigene Farbe der Querringe (sonst abgedunkelt), spots: Farbe von Flecken an den Flanken je Glied,
  // bulge: Glieder wölben sich zwischen den Ringen (Larven), cap: Spitze am Ende (sonst offenes Rohr)
  constructor(scene, mat, len, r0, r1, { head = null, color = null, rings = 0, ringColor = null, spots = null, bulge = 0, cap = false } = {}) {
    this.len = len;
    const l = len / SEG;
    const rows = rings ? Math.max(SEG * 3, rings * 6) : SEG * 3;          // genug Querschnitte, damit jeder Ring sichtbar ist
    let geo = new THREE.CylinderGeometry(r1, r0, len, 12, rows, true).translate(0, len / 2, 0);
    if (cap) {                                                            // stumpfe Spitze am Ende (Larvenschwanz)
      const tipGeo = new THREE.ConeGeometry(r1, r1 * 2.2, 12, 3, true).translate(0, len + r1 * 1.1, 0);
      geo = mergeGeometries([geo.toNonIndexed(), tipGeo.toNonIndexed()]);
    }
    const pos = geo.attributes.position, n = pos.count;
    if (bulge && rings) for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      if (y > len) continue;
      const k = 1 + bulge * Math.sqrt(Math.abs(Math.sin(y * Math.PI * rings / len)));
      pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k);
    }
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const y = Math.min(SEG, Math.max(0, pos.getY(i) / l)), b = Math.min(SEG - 1, Math.floor(y)), f = y - b;   // max: Rundungsfehler an der Wurzel
      si[i * 4] = b; si[i * 4 + 1] = b + 1; sw[i * 4] = 1 - f; sw[i * 4 + 1] = f;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (color) {
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = Math.sin(pos.getY(i) * Math.PI * rings / len), ring = rings && Math.abs(s) < 0.2;
        let c = color;
        if (ring) c = ringColor || color.map(x => x * 0.6);
        else if (spots && Math.abs(s) > 0.93 && Math.abs(pos.getX(i)) > 0.9 * Math.hypot(pos.getX(i), pos.getZ(i))) c = spots;
        col.set(c, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.bones = [];
    for (let i = 0; i <= SEG; i++) {
      const b = new THREE.Bone();
      if (i) { b.position.y = l; this.bones[i - 1].add(b); }
      this.bones.push(b);
    }
    this.mesh = new THREE.SkinnedMesh(geo, mat);
    this.mesh.add(this.bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.frustumCulled = false;
    this.head = head;
    if (head) this.bones[SEG].add(head);
    scene.add(this.mesh);
    this.pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.qw = Array.from({ length: SEG + 1 }, () => new THREE.Quaternion());
    this.tip = new THREE.Vector3();          // Weltposition der Spitze
    this.dir = new THREE.Vector3(0, 1, 0);   // Richtung des letzten Glieds
    this.grow = 1;
    this.phase = Math.random() * 10;
  }

  // Kette an der Kurve root -> tip ausrichten; c1/c2 sind die Bezier-Kontrollpunkte, aim die Blickrichtung der Spitze
  pose(root, c1, c2, tip, aim) {
    const l = this.len / SEG * this.grow, P = this.pts;
    P[0].copy(root);
    for (let i = 1; i <= SEG; i++) {
      bezier(_a, root, c1, c2, tip, i / SEG);
      _b.subVectors(_a, P[i - 1]).normalize();
      P[i].copy(P[i - 1]).addScaledVector(_b, l);
      this.qw[i - 1].setFromUnitVectors(Y, _b);
    }
    this.dir.copy(_b);
    this.qw[SEG].setFromUnitVectors(Y, _b.copy(aim).normalize());
    this.qw[SEG].slerp(this.qw[SEG - 1], 0.25);
    const B = this.bones;
    B[0].position.copy(root);
    B[0].quaternion.copy(this.qw[0]);
    B[0].scale.setScalar(Math.max(0.02, this.grow));
    for (let i = 1; i <= SEG; i++) B[i].quaternion.copy(_qi.copy(this.qw[i - 1]).invert()).multiply(this.qw[i]);
    this.tip.copy(P[SEG]);
  }

  // kleinster Abstand der Kette zu einem Punkt
  dist(p) {
    let d = Infinity;
    for (let i = 0; i < SEG; i++) d = Math.min(d, segDist(p, this.pts[i], this.pts[i + 1]));
    return d;
  }

  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
}
