// Stadt aus city.glb: ein InstancedMesh pro Gebäudetyp und Material, Straßenraster, Bucht im Süden, Zerstörung
import * as THREE from 'three';
import { patchBuildingMaterial, addInstanceAttributes } from './buildings.js';
import { GroundScars, patchGround, Decals } from './ground.js';

export const P = 136;          // Rastermaß: Blockmitten liegen auf Vielfachen von P
const ROAD = 26;
const BLOCK = P - ROAD;
// Kartenform je Level (in Blöcken): n = Blöcke vom Zentrum nach Ost/West/Nord, bay = Reihe, ab der im Süden Wasser
// beginnt, center = Mitte des Hochhausviertels, towerR/officeR = Zonenradien. Die Karte ist absichtlich kompakt –
// eine größere fühlte sich leer an, man kam nicht über das untere Viertel hinaus.
export const DEFAULT_LAYOUT = { n: 6, bay: 4.5, center: { x: 0, z: -0.5 }, towerR: 2.4, officeR: 4.2, seed: 1984 };

const ZONES = {
  tower: { lots: 2, types: ['tower_glass', 'tower_tri', 'tower_step', 'office_b', 'tower_glass', 'office_a'] },
  office: { lots: 2, types: ['office_a', 'office_b', 'office_c', 'apt_a', 'apt_b', 'apt_b'] },
  mixed: { lots: 4, types: ['shop_a', 'shop_b', 'apt_b', 'house_a', 'house_b', 'house_a', 'house_b'] },
  port: { lots: 2, types: ['warehouse', 'warehouse', 'oiltank'] },
  neon: { lots: 4, types: ['shop_a', 'shop_b', 'shop_a', 'shop_b', 'apt_b'] },   // Vergnügungsviertel: Läden dicht an dicht
};

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class City {
  constructor(gltf, scene, fx, events, layout = {}) {
    const L = this.cfg = { ...DEFAULT_LAYOUT, ...layout };
    this.n = L.n;
    this.bayZ = L.bay * P;
    this.center = { x: L.center.x * P, z: L.center.z * P };
    this.extent = (L.n + 0.5) * P;                       // halbe Kartenbreite (Rand der äußersten Blöcke)
    this.groundSize = P * 2 * (L.n + 2);
    this.types = {};
    for (const node of gltf.scene.children) {
      const meshes = [];
      node.traverse(o => { if (o.isMesh) meshes.push(o); });
      for (const m of meshes) patchBuildingMaterial(m.material);
      this.types[node.name.replace(/^B_/, '')] = { size: node.userData.size || [12, 12, 4], meshes };
    }
    this.buildings = this.layout(rng(L.seed));
    this.instanced = this.instantiate(scene);
    this.scars = new GroundScars(this.groundSize);
    this.decals = new Decals(scene);
    scene.add(makeGround(this.scars, this.groundSize), makeWater(this.bayZ));
    // Flüsse (Wasserstreifen quer über die Karte, z0..z1 in m) und Parks (leere Blöcke i0..i1, j0..j1) je Level
    this.rivers = L.rivers || [];
    this.parks = L.parks || [];
    for (const r of this.rivers) scene.add(makeRiver(r, this.groundSize));
    for (const k of this.parks) scene.add(makePark(k));
    this.fx = fx;
    this.events = events;
    this.time = 0;
    this.falling = [];
    this.shaking = new Set();
    this.burning = new Set();
    this.smolder = [];
    this.destroyed = 0;
    // Schutthaufen: zwei Varianten, je ein Pool so groß wie die Stadt, wächst über count
    this.rubble = ['rubble', 'rubble_b'].map(name => {
      const meshes = this.types[name].meshes.map(src => {
        const im = new THREE.InstancedMesh(src.geometry, src.material, this.buildings.length * 2);
        im.count = 0;
        im.receiveShadow = true;
        im.frustumCulled = false;
        scene.add(im);
        return im;
      });
      return { meshes, attrs: addInstanceAttributes(meshes.map(m => m.geometry), this.buildings.length * 2, [-1, 0, 0, 0]) };
    });
  }

  zoneOf(i, j) {
    if (this.cfg.zoneOf) return this.cfg.zoneOf(i, j, this);   // Level mit eigener Aufteilung
    const z = j * P;
    if (z > this.bayZ - 2 * P) return 'port';
    const d = Math.hypot(i * P - this.center.x, z - this.center.z) / P;
    if (d < this.cfg.towerR) return 'tower';
    if (d < this.cfg.officeR) return 'office';
    return 'mixed';
  }

  layout(rand) {
    const out = [];
    for (let j = -this.n; j * P < this.bayZ - P * 0.5; j++) {
      for (let i = -this.n; i <= this.n; i++) {
        const zone = ZONES[this.zoneOf(i, j)];
        if (!zone) continue;                                  // Level-Zonen dürfen Blöcke freilassen (Parks, Flüsse)
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
    const hp = hpFor(h);
    return { type, x, z, rot, hw: (quarter ? d : w) / 2, hd: (quarter ? w : d) / 2, h, hp, maxHp: hp, alive: true,
      lean: 0, leanAxis: new THREE.Vector3(1, 0, 0), hitSet: false, fxT: -9 };
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
      const attrs = addInstanceAttributes(meshes.map(im => im.geometry), bs.length);
      bs.forEach((b, k) => {
        b.meshes = meshes; b.index = k; b.attrs = attrs;
        m.compose(new THREE.Vector3(b.x, 0, b.z), q.setFromAxisAngle(up, b.rot), new THREE.Vector3(1, 1, 1));
        for (const im of meshes) im.setMatrixAt(k, m);
      });
      for (const im of meshes) im.computeBoundingSphere();
    }
    return list;
  }

  // Liegt der Punkt in einem stehenden Gebäude? (Geschosse explodieren daran)
  inside(p) {
    for (const b of this.buildings) {
      if (b.alive && p.y < b.h && Math.abs(p.x - b.x) < b.hw && Math.abs(p.z - b.z) < b.hd) return true;
    }
    return false;
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

  // Schaden im Umkreis (Abstand zur Grundfläche). from = Ursprung des Angriffs (bestimmt Fall- und Neigerichtung),
  // hy = Höhe des Treffers (Klaue ~45 m, Schwanz ~12 m), falloff: außen nur noch 40 %. hitSet: Gebäude, die dieser
  // Angriff schon getroffen hat, werden übersprungen (Schwanzhieb trifft jedes nur einmal). Rückgabe: getroffene Gebäude.
  damage(pos, radius, amount, from = pos, falloff = false, hy = pos.y, hitSet = null) {
    let n = 0;
    for (const b of this.buildings) {
      if (!b.alive || pos.y > b.h + radius || hitSet?.has(b)) continue;
      const d = footDist(b, pos.x, pos.z);
      if (d > radius) continue;
      // Trefferpunkt: auf die Grundfläche geklemmt, also die dem Angriff zugewandte Seite
      _hit.set(THREE.MathUtils.clamp(pos.x, b.x - b.hw, b.x + b.hw), THREE.MathUtils.clamp(hy, 1, b.h - 1),
        THREE.MathUtils.clamp(pos.z, b.z - b.hd, b.z + b.hd));
      this.hit(b, falloff ? amount * (1 - 0.6 * d / radius) : amount, from, _hit);
      hitSet?.add(b);
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
      _hit.set(THREE.MathUtils.clamp(center.x, b.x - b.hw, b.x + b.hw), Math.min(b.h - 1, 30),
        THREE.MathUtils.clamp(center.z, b.z - b.hd, b.z + b.hd));
      this.hit(b, CRUSH_DPS * dt, center, _hit);
      if (b.alive) block = Math.max(block, b.h);
    }
    return block;
  }

  hit(b, amount, from, at) {
    if (!b.alive) return;
    b.hp -= amount;
    const d = Math.min(1, 1 - b.hp / b.maxHp);
    // Trefferpunkt in Gebäudekoordinaten; spätere Treffer ziehen ihn ein Stück zu sich
    const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = at.x - b.x, dz = at.z - b.z;
    const lx = dx * c - dz * s, ly = at.y, lz = dx * s + dz * c;
    const A = b.attrs.dmg, i = b.index, k = b.hitSet ? 0.15 : 1;
    b.hitSet = true;
    A.setXYZW(i, d, A.getY(i) + (lx - A.getY(i)) * k, A.getZ(i) + (ly - A.getZ(i)) * k, A.getW(i) + (lz - A.getW(i)) * k);
    A.needsUpdate = true;
    if (b.hp <= 0) { this.collapse(b, from); return; }
    // schwer beschädigte Gebäude neigen sich vom Angreifer weg
    if (d > 0.45) {
      _dir.set(b.x - from.x, 0, b.z - from.z);
      if (_dir.lengthSq() > 1) b.leanAxis.crossVectors(UP, _dir.normalize());
      b.lean = Math.max(b.lean, (d - 0.45) * 0.09);
    }
    b.shakeT = 0.3;
    this.shaking.add(b);
    if (this.time - b.fxT > 0.2) {                  // Brocken und Staub am Einschlag, gedrosselt (Strahl trifft jeden Frame)
      b.fxT = this.time;
      this.fx.debris.emit(at, 1 + (Math.random() < d ? 1 : 0), { speed: 10, size: 1.5 + d * 2 });
      this.fx.dust.emit(at.x, at.y, at.z, 2, { spread: 3, up: 1, out: 6, size: 8 + d * 6, life: 2.5 });
    }
    if (d > 0.55 && !b.burning) {
      b.burning = true;
      b.fire = at.clone();
      this.burning.add(b);
      if (this.burning.size > MAX_FIRES) { const old = this.burning.values().next().value; old.burning = false; this.burning.delete(old); }
    }
  }

  collapse(b, from) {
    b.alive = false;
    b.burning = false;
    this.burning.delete(b);
    this.shaking.delete(b);
    this.destroyed++;
    const dir = new THREE.Vector3(b.x - from.x, 0, b.z - from.z);
    if (dir.lengthSq() < 1) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    const topple = b.h >= TOPPLE_H;
    // manche Gebäude bleiben als Teilruine stehen: mittlere brechen oben ab, Türme lassen nach dem Kippen einen Stumpf
    const ruin = topple ? Math.random() < 0.5 : b.h >= 12 && Math.random() < RUIN_P;
    const a = Math.random() * Math.PI * 2;
    const axis = new THREE.Vector3().crossVectors(UP, dir);
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const breakY = b.h * (0.32 + Math.random() * 0.2);
    this.falling.push({
      b, t: 0, topple, ruin, dir, acc: 0, landed: false, ring: false,
      ruinY: topple ? breakY * (0.45 + Math.random() * 0.3) : b.h * (0.25 + Math.random() * 0.35),
      dur: topple ? TOPPLE_FALL + 1.6 : ruin ? 1.2 + b.h / 60 : 1.5 + b.h / 50,
      tiltAxis: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), tilt: 0.06 + Math.random() * 0.1,
      edge: Math.abs(dir.x) * b.hw + Math.abs(dir.z) * b.hd,   // Abstand Mitte -> Kippkante
      // Knick: Bruchhöhe und Achse in Gebäudekoordinaten (Achse = UP x Fallrichtung)
      breakY, bendMax: 0.35 + Math.random() * 0.3,
      axisAngle: Math.atan2(axis.x * s + axis.z * c, axis.x * c - axis.z * s),
      dmg0: b.attrs.dmg.getX(b.index),
    });
    const r = Math.max(b.hw, b.hd);
    this.fx.dust.emit(b.x, b.h * 0.3, b.z, Math.min(30, 6 + r), { spread: r, up: 3, out: 5, size: 10 + r * 0.4, life: 4 });
    this.fx.debris.emit(_v.set(b.x, b.h * 0.8, b.z), Math.min(10, 3 + Math.round(b.h / 12)), { speed: 12, size: 2 + r * 0.08 });
    this.events.emit('collapse', { b, topple });
  }

  update(dt) {
    this.time += dt;
    this.scars.update(dt);
    for (const b of this.shaking) {
      b.shakeT -= dt;
      const a = Math.max(0, b.shakeT) / 0.3 * 0.6;
      this.baseMatrix(b, _m, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      this.setMatrix(b, _m);
      if (b.shakeT <= 0) this.shaking.delete(b);
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i], b = f.b;
      f.t += dt;
      if (f.topple) this.toppleStep(f, dt); else if (f.ruin) this.ruinStep(f, dt); else this.sinkStep(f, dt);
      this.setMatrix(b, _m);
      if (f.t >= f.dur) {
        if (f.ruin) this.finishRuin(f); else this.setMatrix(b, ZERO);
        this.addRubble(f);
        this.falling.splice(i, 1);
      }
    }
    this.updateFires(dt);
  }

  setMatrix(b, m) {
    for (const im of b.meshes) { im.setMatrixAt(b.index, m); im.instanceMatrix.needsUpdate = true; }
  }

  // Ruhelage eines stehenden Gebäudes, mit Schräglage durch Schaden und optionalem Zittern
  baseMatrix(b, out, jx = 0, jz = 0) {
    _q.setFromAxisAngle(b.leanAxis, b.lean).multiply(_q2.setFromAxisAngle(UP, b.rot));
    return out.compose(_v.set(b.x + jx, 0, b.z + jz), _q, ONE);
  }

  // Einsturz: das Gebäude sackt Stockwerk um Stockwerk zusammen (staucht sich), kippt leicht, sinkt in die eigene
  // Staubwolke; die Fassade zerfällt dabei (Schaden im Shader wächst über 1), Brocken fallen von oben
  sinkStep(f, dt) {
    const b = f.b, k = Math.min(1, f.t / f.dur), e = k * k;
    const shake = (1 - k) * 0.8 * Math.sin(f.t * 41);
    _q.setFromAxisAngle(f.tiltAxis, f.tilt * Math.min(1, k * 1.6)).multiply(_q2.setFromAxisAngle(b.leanAxis, b.lean))
      .multiply(_q3.setFromAxisAngle(UP, b.rot));
    _m.compose(_v.set(b.x + shake, -b.h * 0.72 * e, b.z - shake), _q, _s.set(1 + 0.07 * k, 1 - 0.5 * e, 1 + 0.07 * k));
    b.attrs.dmg.setX(b.index, Math.max(f.dmg0, 0.4 + 0.45 * k));
    b.attrs.dmg.needsUpdate = true;
    const r = Math.max(b.hw, b.hd);
    this.dustAlong(f, dt, 12 + r * 0.8);
    if (Math.random() < dt * (2 + b.h / 20)) {
      const top = b.h * (1 - 0.5 * e) - b.h * 0.72 * e;
      if (top > 2) this.fx.debris.emit(_v.set(b.x + (Math.random() - 0.5) * b.hw * 2, top, b.z + (Math.random() - 0.5) * b.hd * 2),
        1, { speed: 5, up: 0.4, size: 1.5 + r * 0.06 });
    }
    if (!f.ring && k > 0.45) this.dustRing(f, b.x, b.z, r);
  }

  // Teilruine: der obere Teil bröckelt von oben nach unten weg (Abbruchhöhe im Shader sinkt), das Gebäude zittert,
  // Staub und Brocken stürzen von der Bruchkante
  ruinStep(f, dt) {
    const b = f.b, k = Math.min(1, f.t / f.dur);
    const cut = b.h - (b.h - f.ruinY) * (1 - (1 - k) * (1 - k));
    const shake = (1 - k) * 0.6 * Math.sin(f.t * 43);
    this.baseMatrix(b, _m, shake, -shake);
    b.attrs.fx.setX(b.index, cut);
    b.attrs.fx.needsUpdate = true;
    b.attrs.dmg.setXYZW(b.index, Math.max(f.dmg0, 0.55 + 0.2 * k), 0, cut, 0);
    b.attrs.dmg.needsUpdate = true;
    const r = Math.max(b.hw, b.hd);
    for (f.acc += (8 + r * 0.6) * dt; f.acc >= 1; f.acc--) {
      const a = Math.random() * Math.PI * 2;
      this.fx.dust.emit(b.x + Math.cos(a) * b.hw, cut, b.z + Math.sin(a) * b.hd, 1, { spread: 3, up: 1.5, out: 5, size: 10 + r * 0.3, life: 4 });
    }
    if (Math.random() < dt * (3 + b.h / 15)) {
      this.fx.debris.emit(_v.set(b.x + (Math.random() - 0.5) * b.hw * 2, cut, b.z + (Math.random() - 0.5) * b.hd * 2),
        1, { speed: 6, up: 0.4, size: 1.5 + r * 0.06 });
    }
    if (!f.ring && k > 0.6) this.dustRing(f, b.x, b.z, r);
  }

  // Ruine bleibt stehen (auch der Stumpf eines umgestürzten Turms, der im Staub des Aufschlags wieder auftaucht)
  finishRuin(f) {
    const b = f.b;
    b.ruin = true;
    this.setMatrix(b, this.baseMatrix(b, _m));
    b.attrs.fx.setXYZW(b.index, f.ruinY, 0, 0, 0);
    b.attrs.fx.needsUpdate = true;
    b.attrs.dmg.setXYZW(b.index, Math.max(b.attrs.dmg.getX(b.index), 0.75), 0, f.ruinY, 0);
    b.attrs.dmg.needsUpdate = true;
  }

  // Kippen: das Hochhaus fällt um die Kante auf der dem Angreifer abgewandten Seite und knickt dabei an einer
  // Bruchstelle ein (Shader), schlägt auf, zerbricht und sinkt ein Stück in den Boden
  toppleStep(f, dt) {
    const b = f.b;
    const k = Math.min(1, f.t / TOPPLE_FALL);
    const ang = Math.PI / 2 * 0.9 * k * k;
    const after = f.t > TOPPLE_FALL ? Math.min(1, (f.t - TOPPLE_FALL) / (f.dur - TOPPLE_FALL)) : 0;
    const ex = f.dir.x * f.edge, ez = f.dir.z * f.edge;
    _axis.crossVectors(UP, f.dir);
    _m.makeTranslation(b.x + ex, -after * Math.min(b.hw, b.hd) * 1.2, b.z + ez)
      .multiply(_m2.makeRotationAxis(_axis, ang))
      .multiply(_m2.makeTranslation(-ex, 0, -ez))
      .multiply(_m2.makeRotationY(b.rot));
    const bend = f.bendMax * THREE.MathUtils.smoothstep(k, 0.15, 0.9);
    b.attrs.fx.setXYZW(b.index, 0, f.breakY, bend, f.axisAngle);
    b.attrs.fx.needsUpdate = true;
    // Risse an der Bruchstelle, nach dem Aufschlag zerfällt der ganze Turm
    b.attrs.dmg.setXYZW(b.index, Math.max(f.dmg0, 0.5 + 0.2 * k + 0.3 * after), 0, f.breakY, 0);
    b.attrs.dmg.needsUpdate = true;
    if (k < 1) this.dustAlong(f, dt, 6 + 10 * k);
    else if (!f.landed) this.land(f);
  }

  // Aufschlag: Staubwalze entlang des Turms, Trümmerregen, zerschlägt was darunter steht (Kettenreaktion)
  land(f) {
    f.landed = true;
    const b = f.b, w = Math.min(b.hw, b.hd) + 4;
    const x0 = b.x + f.dir.x * f.edge, z0 = b.z + f.dir.z * f.edge;
    for (let s = 0; s <= b.h; s += 10) {
      const x = x0 + f.dir.x * s, z = z0 + f.dir.z * s;
      this.fx.dust.emit(x, 0, z, 3, { spread: w, up: 4, out: 14, size: 18, life: 6 });
      if (s % 30 === 0) this.fx.debris.emit(_v.set(x, 6, z), 2, { speed: 16, size: 2.5 });
    }
    const from = _v2.set(x0, 0, z0);
    for (const o of this.buildings) {
      if (!o.alive) continue;
      const t = Math.max(0, Math.min(b.h, (o.x - x0) * f.dir.x + (o.z - z0) * f.dir.z));
      const d = footDist(o, x0 + f.dir.x * t, z0 + f.dir.z * t);
      if (d < w) this.hit(o, TOPPLE_DAMAGE, from, _hit.set(o.x, Math.min(o.h - 1, 20), o.z));
    }
    this.events.emit('topple', { b, from: from.clone(), dir: f.dir.clone(), length: b.h, width: w });
  }

  // Staub quillt an der Grundfläche hervor
  dustAlong(f, dt, rate) {
    const b = f.b;
    for (f.acc += rate * dt; f.acc >= 1; f.acc--) {
      const a = Math.random() * Math.PI * 2;
      this.fx.dust.emit(b.x + Math.cos(a) * b.hw, 0, b.z + Math.sin(a) * b.hd, 1,
        { spread: 3, up: 3 + b.h * 0.04, out: 6, size: 10 + b.h * 0.08, life: 4.5 });
    }
  }

  // Staubwalze, die flach über die Straßen rollt
  dustRing(f, x, z, r) {
    f.ring = true;
    const n = Math.min(26, 10 + Math.round(r));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      this.fx.dust.emit(x + Math.cos(a) * r, 1, z + Math.sin(a) * r, 1, { spread: 2, up: 1.2, out: 18, size: 14 + r * 0.3, life: 5 });
    }
  }

  // Brände auf schwer beschädigten Gebäuden, Glut und Rauch über frischem Schutt
  updateFires(dt) {
    const fire = this.fx.fire, dust = this.fx.dust;
    for (const b of this.burning) {
      if (Math.random() < dt * 7) {
        fire.emit(b.fire.x, b.fire.y, b.fire.z, 1, { spread: 4, up: 9, out: 1.5, size: 9, life: 1.1 });
      }
      if (Math.random() < dt * 2.5) dust.emit(b.fire.x, b.fire.y + 6, b.fire.z, 1, SMOKE);
    }
    const tick = Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4);
    for (let i = this.smolder.length - 1; i >= 0; i--) {
      const s = this.smolder[i];
      s.t += dt;
      const k = s.t / SMOLDER_TIME;
      if (s.t < 12 && Math.random() < dt * (1 + s.r / 10) * (1 - s.t / 12)) {
        fire.emit(s.x, 2, s.z, 1, { spread: s.r * 0.7, up: 7, out: 1, size: 8, life: 1 });
      }
      if (Math.random() < dt * 2 * (1 - k)) dust.emit(s.x, 3, s.z, 1, { ...SMOKE, spread: s.r * 0.6 });
      if (tick) {
        s.attrs.dmg.setX(s.idx, Math.max(0.12, 1 - k));
        s.attrs.dmg.needsUpdate = true;
      }
      if (k >= 1) this.smolder.splice(i, 1);
    }
  }

  // Schutt bleibt liegen: ein Haufen auf der Grundfläche oder, bei gekippten Türmen, eine Kette von Haufen längs
  // der Fallrichtung. Fast gleichmäßig skaliert (nur flacher), damit Platten und Brocken nicht zu Splittern verzerren.
  addRubble(f) {
    const b = f.b;
    if (f.topple) {
      const w = Math.min(b.hw, b.hd) * 2, step = w * 0.85, len = b.h;
      for (let s = step * 0.5; s < len; s += step) {
        const d = f.edge + s, j = (Math.random() - 0.5) * w * 0.3;
        const x = b.x + f.dir.x * d - f.dir.z * j, z = b.z + f.dir.z * d + f.dir.x * j;
        this.placeRubble(x, z, w * (1.1 + Math.random() * 0.4), s < step);
        this.decals.add('crack', x, z, Math.random() * 6.3, w * 2.4);
      }
      this.scars.line(b.x + f.dir.x * f.edge, b.z + f.dir.z * f.edge, f.dir, len, w * 1.3);
    } else if (f.ruin) {
      // eingestürzte Decken füllen die offene Ruine, weitere Trümmer liegen auf der vom Angreifer abgewandten Seite
      const r = Math.max(b.hw, b.hd), inner = Math.min(b.hw, b.hd) * 2.1;
      this.placeRubble(b.x, b.z, inner, false, Math.min(f.ruinY * 0.7, inner * 0.9));
      this.placeRubble(b.x + f.dir.x * r * 1.1, b.z + f.dir.z * r * 1.1, r * 1.5, true);
      this.decals.add('crack', b.x, b.z, Math.random() * 6.3, r * 3.2);
      this.scars.collapse(b.x, b.z, r * 0.8);
    } else {
      const r = Math.max(b.hw, b.hd);
      this.placeRubble(b.x, b.z, r * 2.4, true);
      this.decals.add('crack', b.x, b.z, Math.random() * 6.3, r * 4);
      this.scars.collapse(b.x, b.z, r);
    }
  }

  // height: gewünschte Höhe in m (sonst flach nach RUBBLE_FLAT)
  placeRubble(x, z, size, smolder, height = 0) {
    _q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    _m.compose(_v.set(x, 0, z), _q, _s.set(size, height ? height / 0.35 : size * RUBBLE_FLAT, size));
    const pool = this.rubble[Math.random() < 0.5 ? 0 : 1];
    const idx = pool.meshes[0].count;
    if (idx >= pool.meshes[0].instanceMatrix.count) return;
    for (const im of pool.meshes) {
      im.setMatrixAt(idx, _m);
      im.count = idx + 1;
      im.instanceMatrix.needsUpdate = true;
    }
    pool.attrs.dmg.setX(idx, smolder ? 1 : 0.4);
    pool.attrs.dmg.needsUpdate = true;
    if (smolder) this.smolder.push({ attrs: pool.attrs, idx, t: 0, x, z, r: size * 0.4 });
  }
}

const TOPPLE_H = 70;          // ab dieser Höhe kippen Gebäude statt einzusinken
const TOPPLE_FALL = 2.1;      // s bis zum Aufschlag
const TOPPLE_DAMAGE = 260;    // Schaden für alles, worauf ein Turm fällt
const CRUSH_DPS = 320;        // Godzillas Körper gegen Gebäude
const RUBBLE_FLAT = 0.55;     // Schutt in der Höhe gestaucht (Modell: 1 breit, 0,35 hoch)
const RUIN_P = 0.45;          // Anteil mittlerer Gebäude (ab 12 m), die als Teilruine stehen bleiben
const MAX_FIRES = 40;         // gleichzeitig brennende Gebäude (älteste erlöschen)
const SMOLDER_TIME = 45;      // s, bis die Glut im Schutt verloschen ist
const SMOKE = { spread: 4, up: 7, out: 2, size: 20, life: 7, color: [0.06, 0.06, 0.065] };
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _axis = new THREE.Vector3();
const _hit = new THREE.Vector3(), _dir = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

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
function makeGround(scars, size) {
  const S = 512, px = S / P, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#1e1f22'; g.fillRect(0, 0, S, S);                       // Asphalt
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
  tex.repeat.set(size / P, size / P);
  tex.offset.set(0.5, 0.5);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
  patchGround(mat, scars);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function makeRiver(r, size) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(size, r.z1 - r.z0),
    new THREE.MeshStandardMaterial({ color: 0x0c1a28, roughness: 0.45, metalness: 0.15 }));
  w.rotation.x = -Math.PI / 2;
  w.position.set(0, 0.35, (r.z0 + r.z1) / 2);
  w.receiveShadow = true;
  return w;
}

// Park: dunkle Wiese über den leeren Blöcken samt der Straßen dazwischen, Wege als hellere Streifen
function makePark(k) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#18241a'; g.fillRect(0, 0, 256, 256);
  for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(${20 + Math.random() * 30},${40 + Math.random() * 30},${20 + Math.random() * 20},.6)`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  g.strokeStyle = '#3a3a32'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
  g.strokeRect(50, 50, 156, 156);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = (k.i1 - k.i0 + 1) * P - ROAD, d = (k.j1 - k.j0 + 1) * P - ROAD;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((k.i0 + k.i1) / 2 * P, 0.15, (k.j0 + k.j1) / 2 * P);
  m.receiveShadow = true;
  return m;
}

function makeWater(bayZ) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x0c1a28, roughness: 0.55, metalness: 0.1 }));
  w.rotation.x = -Math.PI / 2;
  w.position.set(0, 0.3, bayZ + 1000);
  w.receiveShadow = true;
  return w;
}
