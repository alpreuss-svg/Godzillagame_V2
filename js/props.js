// Leben in der Stadt: Straßenlaternen mit warmen Lichtkegeln auf dem Asphalt, Bäume in Parks und an Wohnstraßen,
// geparkte Autos und fliehender Verkehr mit Scheinwerfern. Alles als InstancedMesh (wenige Draw Calls). Godzilla
// zertritt, was ihm unter die Füße kommt, Angriffe räumen Requisiten im Umkreis ab.
import * as THREE from 'three';
import { P } from './city.js';

const ROAD = 26;
const CAR_COLORS = [0xd8d8d4, 0x1c1c1e, 0x8a1d18, 0x2a3f6a, 0x6b6e72, 0xb8a882, 0x2f4a36, 0xc9c2b0];

// Instanzen eines mehrteiligen Modells (je Teilmesh ein InstancedMesh, gemeinsame Matrizen)
class Batch {
  constructor(scene, model, count, scale) {
    this.scale = scale;
    this.meshes = [];
    model.updateMatrixWorld(true);
    model.traverse(o => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, count);
      im.userData.local = o.matrixWorld.clone();
      im.count = 0;
      im.receiveShadow = false;
      im.frustumCulled = false;
      scene.add(im);
      this.meshes.push(im);
    });
    this.n = 0;
  }

  add(x, z, rot, s = 1) {
    if (this.n >= this.meshes[0].instanceMatrix.count) return -1;   // voll
    const i = this.n++;
    this.set(i, x, z, rot, s);
    for (const im of this.meshes) im.count = this.n;
    return i;
  }

  set(i, x, z, rot, s = 1, y = 0, tilt = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(tilt, rot, 0)), _s.setScalar(this.scale * s));
    for (const im of this.meshes) { im.setMatrixAt(i, _m2.multiplyMatrices(_m, im.userData.local)); im.instanceMatrix.needsUpdate = true; }
  }

  color(i, c, filter) {
    for (const im of this.meshes) if (filter(im.material)) im.setColorAt(i, c);
  }
}
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Leuchtflecken auf dem Boden (Laternenlicht, Scheinwerfer): additive Quadrate mit weichem Verlauf
function glowSpots(scene, count, color, opacity) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true,
    opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), count);
  im.count = 0;
  im.frustumCulled = false;
  im.renderOrder = 1;
  scene.add(im);
  return im;
}

export class Props {
  constructor(units, scene, city, fx, amount = 1) {   // amount: Menge je Qualitätsstufe
    this.city = city;
    this.fx = fx;
    const get = n => units.scene.getObjectByName(n);
    // Anzahl begrenzt (Ziel-Hardware UHD 615): Laternen sind billig, Bäume und Autos kosten Dreiecke
    this.lamps = new Batch(scene, get('U_lamp'), Math.round(1400 * amount), 1.5);
    this.trees = new Batch(scene, get('U_tree'), Math.round(500 * amount), 2.2);
    this.cars = new Batch(scene, get('U_car'), Math.round(460 * amount), 1.6);
    this.carCap = Math.round(460 * amount);
    this.trafficN = Math.round(100 * amount);
    this.pools = glowSpots(scene, 1800, 0xffb060, 0.32);
    this.heads = glowSpots(scene, 200, 0xfff0c8, 0.5);
    this.items = [];                                   // {kind, i, x, z, alive}
    this.grid = this.buildingGrid();
    this.placeLamps();
    this.placeTrees();
    this.placeCars();
    this.spawnTraffic(this.trafficN);
    for (const b of [this.lamps, this.trees, this.cars]) for (const im of b.meshes) { if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }

  // Grobes Raster der Gebäude, um Requisiten nicht in Häuser zu stellen
  buildingGrid() {
    const grid = new Map();
    for (const b of this.city.buildings) {
      const k = Math.floor(b.x / 40) + ',' + Math.floor(b.z / 40);
      (grid.get(k) || grid.set(k, []).get(k)).push(b);
    }
    return grid;
  }

  free(x, z, pad = 3) {
    const c = this.city;
    if (Math.abs(x) > c.extent || z < -c.extent || z > c.bayZ - 6) return false;
    for (const r of c.rivers) if (z > r.z0 - 4 && z < r.z1 + 4) return false;
    const gx = Math.floor(x / 40), gz = Math.floor(z / 40);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const b of this.grid.get((gx + i) + ',' + (gz + j)) || []) {
        if (Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad) return false;
      }
    }
    return true;
  }

  roadLines() {
    const c = this.city, out = [];
    for (let k = -c.n; k < c.n; k++) out.push((k + 0.5) * P);
    return out;
  }

  // Laternen an beiden Straßenrändern, versetzt alle 34 m, mit Lichtkegel auf der Fahrbahn
  placeLamps() {
    const c = this.city, lines = this.roadLines();
    for (const ax of ['x', 'z']) for (const L of lines) {
      for (let s = -c.extent, side = 1; s < c.extent; s += 34, side = -side) {
        const off = side * (ROAD / 2 - 1.2);
        const x = ax === 'x' ? L + off : s, z = ax === 'x' ? s : L + off;
        if (!this.free(x, z, 1)) continue;
        const rot = ax === 'x' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);   // Arm zur Fahrbahn
        const i = this.lamps.add(x, z, rot);
        if (i < 0) return;
        const px = ax === 'x' ? L + off * 0.55 : s, pz = ax === 'x' ? s : L + off * 0.55;
        this.setSpot(this.pools, i, px, pz, 22);
        this.items.push({ kind: 'lamp', i, x, z, alive: true });
      }
    }
  }

  setSpot(im, i, x, z, size, sx = 1) {
    _m.compose(_p.set(x, 0.25, z), _q.identity(), _s.set(size * sx, 1, size));
    im.setMatrixAt(i, _m);
    im.count = Math.max(im.count, i + 1);
    im.instanceMatrix.needsUpdate = true;
  }

  // Bäume: dicht in Parks, locker an Straßen der Wohn- und Ladenviertel
  placeTrees() {
    const c = this.city, rnd = mulberry(c.cfg.seed + 7);
    for (const k of c.parks) {
      const x0 = (k.i0 - 0.5) * P + 8, x1 = (k.i1 + 0.5) * P - 8, z0 = (k.j0 - 0.5) * P + 8, z1 = (k.j1 + 0.5) * P - 8;
      for (let x = x0; x < x1; x += 15) for (let z = z0; z < z1; z += 15) {
        const px = x + (rnd() - 0.5) * 8, pz = z + (rnd() - 0.5) * 8;
        const lx = ((px % P) + P) % P, lz = ((pz % P) + P) % P;
        if (Math.abs(lx - P / 2) < 6 || Math.abs(lz - P / 2) < 6 || rnd() < 0.25) continue;    // Wege freilassen
        this.addTree(px, pz, rnd);
      }
    }
    for (let i = -c.n; i <= c.n; i++) for (let j = -c.n; j * P < c.bayZ; j++) {
      const zone = c.zoneOf(i, j);
      if (zone !== 'mixed' && zone !== 'office') continue;
      const B = P - ROAD, step = zone === 'mixed' ? 16 : 24;
      for (let t = -B / 2 + 6; t < B / 2 - 4; t += step) {
        for (const [dx, dz] of [[t, -B / 2 - 2], [t, B / 2 + 2], [-B / 2 - 2, t], [B / 2 + 2, t]]) {
          const x = i * P + dx, z = j * P + dz;
          if (rnd() < 0.2 && this.free(x, z, 2)) this.addTree(x, z, rnd);
        }
      }
    }
  }

  addTree(x, z, rnd) {
    const i = this.trees.add(x, z, rnd() * 6.3, 0.8 + rnd() * 0.5);
    if (i < 0) return;
    this.trees.color(i, _c.setHSL(0.27 + rnd() * 0.08, 0.35, 0.35 + rnd() * 0.25), m => /leaf/.test(m.name));
    this.trees.color(i, _c.setRGB(1, 1, 1), m => !/leaf/.test(m.name));
    this.items.push({ kind: 'tree', i, x, z, alive: true });
  }

  // Geparkte Autos am Fahrbahnrand
  placeCars() {
    const c = this.city, rnd = mulberry(c.cfg.seed + 13), lines = this.roadLines();
    for (const ax of ['x', 'z']) for (const L of lines) for (const side of [-1, 1]) {
      for (let s = -c.extent; s < c.extent; s += 9) {
        if (rnd() > 0.08) continue;
        const off = side * (ROAD / 2 - 3.5), x = ax === 'x' ? L + off : s, z = ax === 'x' ? s : L + off;
        if (!this.free(x, z, 1)) continue;
        if (this.cars.n >= this.carCap - this.trafficN) return;   // Platz für den fahrenden Verkehr lassen
        const i = this.cars.add(x, z, (ax === 'x' ? 0 : Math.PI / 2) + (rnd() < 0.5 ? Math.PI : 0));
        this.paint(i, rnd);
        this.items.push({ kind: 'car', i, x, z, alive: true });
      }
    }
  }

  paint(i, rnd) {
    this.cars.color(i, _c.set(CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]), m => /white/.test(m.name));
    this.cars.color(i, _c.setRGB(1, 1, 1), m => !/white/.test(m.name));
  }

  // Fahrender Verkehr: Autos auf den Fahrspuren, mit Scheinwerferkegel; fliehen vor Godzilla
  spawnTraffic(n) {
    this.traffic = [];
    const rnd = mulberry(this.city.cfg.seed + 29);
    for (let k = 0; k < n; k++) {
      const i = this.cars.add(0, 0, 0);
      this.paint(i, rnd);
      const t = { i, h: k, alive: true, respawn: 0 };
      this.placeCar(t, rnd);
      this.traffic.push(t);
    }
    this.heads.count = n;
  }

  placeCar(t, rnd = Math.random, away = null) {
    const c = this.city, lines = this.roadLines();
    for (let tries = 0; tries < 20; tries++) {
      t.ax = rnd() < 0.5 ? 'x' : 'z';
      t.L = lines[Math.floor(rnd() * lines.length)];
      t.dir = rnd() < 0.5 ? 1 : -1;
      t.s = (rnd() - 0.5) * 2 * c.extent;
      t.speed = 9 + rnd() * 7;
      const x = t.ax === 'x' ? t.L + t.dir * 4.5 : t.s, z = t.ax === 'x' ? t.s : t.L - t.dir * 4.5;
      if (z > c.bayZ - 20 || c.rivers.some(r => z > r.z0 - 8 && z < r.z1 + 8)) continue;
      if (away && Math.hypot(x - away.x, z - away.z) < 300) continue;
      t.alive = true;
      return;
    }
  }

  update(dt, g) {
    const gp = g.position, c = this.city;
    // Verkehr fährt, flieht vor Godzilla und wird zertreten
    for (const t of this.traffic) {
      if (!t.alive) {
        if ((t.respawn -= dt) <= 0) this.placeCar(t, Math.random, gp);
        else continue;
      }
      const x = t.ax === 'x' ? t.L + t.dir * 4.5 : t.s, z = t.ax === 'x' ? t.s : t.L - t.dir * 4.5;
      const d = Math.hypot(x - gp.x, z - gp.z);
      if (d < 160) {                                   // fährt auf Godzilla zu? umdrehen und Gas geben
        const toward = (t.ax === 'x' ? gp.z - z : gp.x - x) * t.dir > 0;
        if (toward && d > 30) t.dir = -t.dir;
        t.speed = Math.min(26, t.speed + dt * 10);
      }
      t.s += t.dir * t.speed * dt;
      if (Math.abs(t.s) > c.extent + 20 || (t.ax === 'x' && t.s > c.bayZ - 20)) { t.alive = false; t.respawn = 2; this.hideCar(t); continue; }
      if (t.ax === 'x' && c.rivers.some(r => t.s > r.z0 - 8 && t.s < r.z1 + 8)) t.dir = -t.dir;   // keine Brücken: umdrehen
      if (d < 18) { this.wreck(x, z); t.alive = false; t.respawn = 20; this.hideCar(t); continue; }
      const rot = t.ax === 'x' ? (t.dir > 0 ? 0 : Math.PI) : (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.cars.set(t.i, x, z, rot);
      const fx = t.ax === 'x' ? 0 : t.dir * 14, fz = t.ax === 'x' ? t.dir * 14 : 0;
      this.setSpot(this.heads, t.h, x + fx, z + fz, 12, t.ax === 'x' ? 0.7 : 1.6);
    }
    // stehende Requisiten unter Godzillas Füßen
    this.knock(gp, 16, false);
  }

  hideCar(t) {
    this.cars.set(t.i, 0, -9999, 0, 0.001);
    this.setSpot(this.heads, t.h, 0, -9999, 0.01);
  }

  wreck(x, z) {
    this.fx.fire.emit(x, 2, z, 3, { spread: 2, up: 4, out: 3, size: 7, life: 0.6 });
    this.fx.dust.emit(x, 1, z, 2, { spread: 3, up: 2, out: 3, size: 9, life: 2, color: [0.2, 0.2, 0.2] });
  }

  // Requisiten im Umkreis umwerfen bzw. zerstören (Schritte, Angriffe, Einstürze)
  knock(pos, r, burn = true) {
    for (const it of this.items) {
      if (!it.alive || Math.abs(it.x - pos.x) > r || Math.abs(it.z - pos.z) > r) continue;
      if (Math.hypot(it.x - pos.x, it.z - pos.z) > r) continue;
      it.alive = false;
      if (it.kind === 'lamp') { this.lamps.set(it.i, it.x, it.z, 0, 1, 0, Math.PI / 2 - 0.15); this.setSpot(this.pools, it.i, 0, -9999, 0.01); }
      else if (it.kind === 'tree') this.trees.set(it.i, it.x, it.z, Math.random() * 6, 0.9, 0.5, 1.35);
      else { this.cars.set(it.i, it.x, it.z, Math.random() * 6, 1, 0, 0.4); this.cars.color(it.i, _c.setRGB(0.12, 0.11, 0.1), () => true);
        for (const im of this.cars.meshes) if (im.instanceColor) im.instanceColor.needsUpdate = true;
        if (burn) this.wreck(it.x, it.z); }
    }
  }
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
