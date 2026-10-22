// Stadt aus city.glb: ein InstancedMesh pro Gebäudetyp und Material, Straßenraster, Bucht im Süden
import * as THREE from 'three';

const P = 136;                 // Rastermaß: Blockmitten liegen auf Vielfachen von P
const ROAD = 26;
const BLOCK = P - ROAD;
const N = 10;                  // Blöcke in jede Richtung
export const BAY_Z = 7.5 * P;  // südlich davon Wasser

const ZONES = {
  tower: { lots: 2, types: ['tower_glass', 'tower_tri', 'tower_step', 'office_b', 'tower_glass', 'office_a'] },
  office: { lots: 2, types: ['office_a', 'office_b', 'office_c', 'apt_a', 'apt_b', 'apt_b'] },
  mixed: { lots: 4, types: ['shop_a', 'shop_b', 'apt_b', 'house_a', 'house_b', 'house_a', 'house_b'] },
  port: { lots: 2, types: ['warehouse', 'warehouse', 'oiltank'] },
};
const SHINJUKU = new THREE.Vector2(0, -4 * P);

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function zoneOf(i, j) {
  const z = j * P;
  if (z > BAY_Z - 2 * P) return 'port';
  const d = Math.hypot(i * P - SHINJUKU.x, z - SHINJUKU.y) / P;
  if (d < 2.4) return 'tower';
  if (d < 5.5) return 'office';
  return 'mixed';
}

export class City {
  constructor(gltf, scene, fx, events, seed = 1984) {
    this.types = {};
    for (const node of gltf.scene.children) {
      const meshes = [];
      node.traverse(o => { if (o.isMesh) meshes.push(o); });
      this.types[node.name.replace(/^B_/, '')] = { size: node.userData.size || [12, 12, 4], meshes };
    }
    this.buildings = this.layout(rng(seed));
    this.instanced = this.instantiate(scene);
    scene.add(makeGround(), makeWater());
    this.fx = fx;
    this.events = events;
    this.falling = [];
    this.destroyed = 0;
    // Schutthaufen: ein Pool so groß wie die Stadt, wächst über count
    this.rubble = this.types.rubble.meshes.map(src => {
      const im = new THREE.InstancedMesh(src.geometry, src.material, this.buildings.length);
      im.count = 0;
      im.receiveShadow = true;
      im.frustumCulled = false;
      scene.add(im);
      return im;
    });
  }

  layout(rand) {
    const out = [];
    for (let j = -N; j * P < BAY_Z - P * 0.5; j++) {
      for (let i = -N; i <= N; i++) {
        const zone = ZONES[zoneOf(i, j)];
        const cx = i * P, cz = j * P;
        if (zone === ZONES.tower && rand() < 0.15) {         // ganze Blöcke für die Hotelscheibe
          out.push(this.place('tower_slab', cx, cz, rand() < 0.5 ? 0 : Math.PI));
          continue;
        }
        const L = zone.lots, lot = BLOCK / L, room = lot - 4;
        for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) {
          if (rand() < 0.1) continue;                         // Parkplatz / Lücke
          const lx = cx - BLOCK / 2 + lot * (a + 0.5), lz = cz - BLOCK / 2 + lot * (b + 0.5);
          const pick = [...zone.types].sort(() => rand() - 0.5);
          for (const t of pick) {
            const [w, d] = this.types[t].size;
            const turn = rand() < 0.5;
            const [fw, fd] = turn ? [d, w] : [w, d];
            if (fw > room || fd > room) continue;
            const jx = (room - fw) * (rand() - 0.5), jz = (room - fd) * (rand() - 0.5);
            out.push(this.place(t, lx + jx, lz + jz, (turn ? Math.PI / 2 : 0) + (rand() < 0.5 ? Math.PI : 0)));
            break;
          }
        }
      }
    }
    return out;
  }

  place(type, x, z, rot) {
    const [w, d, h] = this.types[type].size;
    const quarter = Math.abs(Math.sin(rot)) > 0.5;
    return { type, x, z, rot, hw: (quarter ? d : w) / 2, hd: (quarter ? w : d) / 2, h, hp: hpFor(h), alive: true };
  }

  instantiate(scene) {
    const groups = {};
    for (const b of this.buildings) (groups[b.type] ||= []).push(b);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const list = [];
    for (const [type, bs] of Object.entries(groups)) {
      const meshes = this.types[type].meshes.map(src => {
        const im = new THREE.InstancedMesh(src.geometry, src.material, bs.length);
        im.receiveShadow = true;
        scene.add(im);
        list.push(im);
        return im;
      });
      bs.forEach((b, k) => {
        b.meshes = meshes; b.index = k;
        m.compose(new THREE.Vector3(b.x, 0, b.z), q.setFromAxisAngle(up, b.rot), new THREE.Vector3(1, 1, 1));
        for (const im of meshes) im.setMatrixAt(k, m);
      });
      for (const im of meshes) im.computeBoundingSphere();
    }
    return list;
  }

  // Abstand entlang des Strahls bis zum ersten stehenden Gebäude (Achsen-Box-Test). Gebäude, in denen der Startpunkt
  // steckt (Godzilla steht mit dem Kopf in einem Hochhaus), zählen nicht – sonst hätte der Strahl die Länge 0.
  raycast(o, d, max) {
    let best = max;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const s = slab(o.x, d.x, b.x - b.hw, b.x + b.hw, 0, best);
      if (!s) continue;
      const s2 = slab(o.y, d.y, 0, b.h, s[0], s[1]);
      if (!s2) continue;
      const s3 = slab(o.z, d.z, b.z - b.hd, b.z + b.hd, s2[0], s2[1]);
      if (s3 && s3[0] > 0.5 && s3[0] < best) best = s3[0];
    }
    return best;
  }

  // ---------- Zerstörung ----------

  // Schaden im Umkreis (Abstand zur Grundfläche). from = Ursprung des Angriffs, bestimmt die Fallrichtung.
  // falloff: außen nur noch 40 % Schaden. Rückgabe: Anzahl getroffener Gebäude.
  damage(pos, radius, amount, from = pos, falloff = false) {
    let n = 0;
    for (const b of this.buildings) {
      if (!b.alive || pos.y > b.h + radius) continue;
      const d = footDist(b, pos.x, pos.z);
      if (d > radius) continue;
      this.hit(b, falloff ? amount * (1 - 0.6 * d / radius) : amount, from);
      n++;
    }
    return n;
  }

  // Godzillas Körper drückt gegen Gebäude: zermalmt sie mit der Zeit. Rückgabe: Höhe des höchsten noch stehenden
  // berührten Gebäudes (0 = freie Bahn), Godzilla wird davon gebremst.
  crush(center, radius, dt) {
    let block = 0;
    for (const b of this.buildings) {
      if (!b.alive || footDist(b, center.x, center.z) > radius) continue;
      this.hit(b, CRUSH_DPS * dt, center);
      if (b.alive) block = Math.max(block, b.h);
    }
    return block;
  }

  hit(b, amount, from) {
    if (!b.alive) return;
    b.hp -= amount;
    if (b.hp <= 0) this.collapse(b, from);
  }

  collapse(b, from) {
    b.alive = false;
    this.destroyed++;
    const dir = new THREE.Vector3(b.x - from.x, 0, b.z - from.z);
    if (dir.lengthSq() < 1) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    const topple = b.h >= TOPPLE_H;
    const a = Math.random() * Math.PI * 2;
    this.falling.push({
      b, t: 0, topple, dir, acc: 0, landed: false,
      dur: topple ? TOPPLE_FALL + 1.4 : 1.3 + b.h / 60,
      axis: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), tilt: 0.05 + Math.random() * 0.1,
      edge: Math.abs(dir.x) * b.hw + Math.abs(dir.z) * b.hd,   // Abstand Mitte -> Kippkante
    });
    const r = Math.max(b.hw, b.hd);
    this.fx.dust.emit(b.x, 0, b.z, Math.min(40, 8 + r), { spread: r, up: 4, out: 6, size: 11 + r * 0.4, life: 4.5 });
    this.fx.debris.emit(_v.set(b.x, Math.min(b.h * 0.6, 40), b.z), Math.min(8, 2 + Math.round(b.h / 15)), { speed: 14 });
    this.events.emit('collapse', { b, topple });
  }

  update(dt) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i], b = f.b;
      f.t += dt;
      if (f.topple) this.toppleStep(f, dt); else this.sinkStep(f, dt);
      for (const im of b.meshes) { im.setMatrixAt(b.index, _m); im.instanceMatrix.needsUpdate = true; }
      if (f.t >= f.dur) {
        for (const im of b.meshes) im.setMatrixAt(b.index, ZERO);
        this.addRubble(f);
        this.falling.splice(i, 1);
      }
    }
  }

  // Einsinken: beschleunigt in den Boden, leicht schief, zittert, Staub quillt an der Grundfläche hervor
  sinkStep(f, dt) {
    const b = f.b, k = Math.min(1, f.t / f.dur);
    const shake = (1 - k) * 0.7 * Math.sin(f.t * 47);
    _q.setFromAxisAngle(f.axis, f.tilt * Math.min(1, k * 2)).multiply(_q2.setFromAxisAngle(UP, b.rot));
    _m.compose(_v.set(b.x + shake, -b.h * 1.02 * k * k, b.z - shake), _q, ONE);
    this.dustAlong(f, dt, 10 + Math.max(b.hw, b.hd));
  }

  // Kippen: Hochhaus fällt um die Kante auf der dem Angreifer abgewandten Seite, schlägt auf, sinkt dann ein Stück ein
  toppleStep(f, dt) {
    const b = f.b;
    const k = Math.min(1, f.t / TOPPLE_FALL);
    const ang = Math.PI / 2 * 0.94 * k * k;
    const sink = f.t > TOPPLE_FALL ? -Math.min(1, (f.t - TOPPLE_FALL) / (f.dur - TOPPLE_FALL)) * Math.min(b.hw, b.hd) : 0;
    const ex = f.dir.x * f.edge, ez = f.dir.z * f.edge;
    _axis.crossVectors(UP, f.dir);
    _m.makeTranslation(b.x + ex, sink, b.z + ez)
      .multiply(_m2.makeRotationAxis(_axis, ang))
      .multiply(_m2.makeTranslation(-ex, 0, -ez))
      .multiply(_m2.makeRotationY(b.rot));
    if (k < 1) this.dustAlong(f, dt, 8);
    else if (!f.landed) this.land(f);
  }

  // Aufschlag: Staubwalze entlang des Turms, zerschlägt was darunter steht (Kettenreaktion)
  land(f) {
    f.landed = true;
    const b = f.b, w = Math.min(b.hw, b.hd) + 4;
    const x0 = b.x + f.dir.x * f.edge, z0 = b.z + f.dir.z * f.edge;
    for (let s = 0; s <= b.h; s += 12) {
      this.fx.dust.emit(x0 + f.dir.x * s, 0, z0 + f.dir.z * s, 3, { spread: w, up: 5, out: 8, size: 17, life: 5 });
    }
    this.fx.debris.emit(_v.set(x0 + f.dir.x * b.h * 0.6, 4, z0 + f.dir.z * b.h * 0.6), 8, { speed: 18 });
    const from = _v2.set(x0, 0, z0);
    for (const o of this.buildings) {
      if (!o.alive) continue;
      const t = Math.max(0, Math.min(b.h, (o.x - x0) * f.dir.x + (o.z - z0) * f.dir.z));
      const d = footDist(o, x0 + f.dir.x * t, z0 + f.dir.z * t);
      if (d < w) this.hit(o, TOPPLE_DAMAGE, from);
    }
    this.events.emit('topple', { b, from: from.clone(), dir: f.dir.clone(), length: b.h, width: w });
  }

  dustAlong(f, dt, rate) {
    const b = f.b;
    for (f.acc += rate * dt; f.acc >= 1; f.acc--) {
      const a = Math.random() * Math.PI * 2;
      this.fx.dust.emit(b.x + Math.cos(a) * b.hw, 0, b.z + Math.sin(a) * b.hd, 1,
        { spread: 3, up: 3 + b.h * 0.04, out: 5, size: 10 + b.h * 0.08, life: 4 });
    }
  }

  // Schutt bleibt liegen: auf der Grundfläche oder, bei gekippten Türmen, längs der Fallrichtung
  addRubble(f) {
    const b = f.b;
    if (f.topple) {
      const len = b.h * 0.95, d = f.edge + len / 2;
      _v.set(b.x + f.dir.x * d, 0, b.z + f.dir.z * d);
      _q.setFromAxisAngle(UP, Math.atan2(f.dir.x, f.dir.z));
      _s.set(Math.min(b.hw, b.hd) * 2, 9 / RUBBLE_H, len);
    } else {
      _v.set(b.x, 0, b.z);
      _q.identity();
      _s.set(b.hw * 2.3, Math.min(3 + b.h * 0.12, 16) / RUBBLE_H, b.hd * 2.3);
    }
    _m.compose(_v, _q, _s);
    for (const im of this.rubble) {
      im.setMatrixAt(im.count++, _m);
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

const TOPPLE_H = 70;          // ab dieser Höhe kippen Gebäude statt einzusinken
const TOPPLE_FALL = 1.9;      // s bis zum Aufschlag
const TOPPLE_DAMAGE = 260;    // Schaden für alles, worauf ein Turm fällt
const CRUSH_DPS = 320;        // Godzillas Körper gegen Gebäude
const RUBBLE_H = 0.35;        // Höhe des Schuttmodells bei Maßstab 1
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _axis = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

// Haltbarkeit nach Höhe: Holzhaus ~45, Laden ~70, Büro ~100–170, Hochhaus ~280–400
function hpFor(h) { return 20 + h * 2.5; }

// Abstand eines Punkts zur Grundfläche (0 = innerhalb)
function footDist(b, x, z) {
  const dx = Math.max(Math.abs(x - b.x) - b.hw, 0), dz = Math.max(Math.abs(z - b.z) - b.hd, 0);
  return Math.hypot(dx, dz);
}

// Strahl gegen ein Achsenintervall; schränkt [t0, t1] ein, null wenn verfehlt. Ein geteiltes Array, keine Allokation.
const SLAB = [0, 0];
function slab(o, d, lo, hi, t0, t1) {
  if (Math.abs(d) < 1e-6) return o < lo || o > hi ? null : (SLAB[0] = t0, SLAB[1] = t1, SLAB);
  let a = (lo - o) / d, c = (hi - o) / d;
  if (a > c) { const t = a; a = c; c = t; }
  SLAB[0] = Math.max(t0, a); SLAB[1] = Math.min(t1, c);
  return SLAB[0] <= SLAB[1] ? SLAB : null;
}

// Boden: eine Kachel = ein Block samt halber Straße ringsum
function makeGround() {
  const S = 512, px = S / P, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#16171a'; g.fillRect(0, 0, S, S);                       // Asphalt
  const r = ROAD / 2 * px, sw = 4 * px;
  g.fillStyle = '#3a3a3c'; g.fillRect(r, r, S - 2 * r, S - 2 * r);        // Gehweg
  g.fillStyle = '#2a2b2c'; g.fillRect(r + sw, r + sw, S - 2 * (r + sw), S - 2 * (r + sw));
  g.strokeStyle = '#8a8270'; g.lineWidth = 2; g.setLineDash([14, 18]);   // Mittellinien auf dem Kachelrand
  for (const o of [1, S - 1]) {
    g.beginPath(); g.moveTo(o, 0); g.lineTo(o, S); g.stroke();
    g.beginPath(); g.moveTo(0, o); g.lineTo(S, o); g.stroke();
  }
  g.setLineDash([]); g.fillStyle = '#9a9a92';                             // Zebrastreifen
  for (let k = 0; k < 6; k++) {
    const y = r + sw + 6 + k * 9;
    g.fillRect(2, y, r - 6, 4); g.fillRect(S - r + 4, y, r - 6, 4);
    g.fillRect(y, 2, 4, r - 6); g.fillRect(y, S - r + 4, 4, r - 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const size = P * 2 * (N + 2);
  tex.repeat.set(size / P, size / P);
  tex.offset.set(0.5, 0.5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function makeWater() {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x0c1a28, roughness: 0.55, metalness: 0.1 }));
  w.rotation.x = -Math.PI / 2;
  w.position.set(0, 0.3, BAY_Z + 1000);
  w.receiveShadow = true;
  return w;
}
