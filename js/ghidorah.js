// 1991: King Ghidorah (Boss) und Mecha-King Ghidorah (Endgegner).
// Rumpf, Flügel und Köpfe kommen aus ghidorah.glb; Hälse und Schwänze sind Ketten (chain.js), die Flügel schlagen um
// das Schultergelenk. King Ghidorah fliegt über der Stadt, landet ab und zu (dann erreichbar für Klaue und Schwanz) und
// feuert Gravitationsstrahlen aus den drei Mäulern – Gebäude dazwischen fangen sie ab. Mecha-King Ghidorah ist
// gepanzert, schießt zusätzlich mit dem Laser des Mechanik-Kopfes und packt Godzilla mit Fangklammern an Seilen
// (nur Atomstrahl oder Kernpuls befreien).
import * as THREE from 'three';
import { Chain, ease } from './chain.js';
import { Beam } from './effects.js';

// Gelenkpunkte aus blender/ghidorah.py, umgerechnet nach glTF (x, z, -y)
const NECK_ROOTS = [[0, 67, 5], [8.5, 64, 2.5], [-8.5, 64, 2.5]];
const TAIL_ROOTS = [[3.2, 31, -11], [-3.2, 31, -11]];
const WING_ROOT = [7.5, 63, -7];
const SCALE = 1.1;
const CHEST = 52 * SCALE, RADIUS = 24;
const NECK_LEN = 36, TAIL_LEN = 72;

const KINDS = {
  king: {
    hp: 100, alt: 78, range: [150, 210], beamEvery: 3.2, beamDur: 1.6, beamDps: 2.6, trioEvery: 13,
    landEvery: 22, landDur: 10, biteDmg: 4,
    dmg: { beam: 4, head: 6, claw: 4, tail: 6, pulse: 8 },
  },
  mecha: {
    hp: 100, alt: 70, range: [140, 200], beamEvery: 2.8, beamDur: 1.6, beamDps: 2.6, trioEvery: 11,
    landEvery: 26, landDur: 9, biteDmg: 4, grabEvery: 19, grabDps: 2.2, grabMax: 7,
    dmg: { beam: 2.5, head: 4, claw: 3, tail: 4.5, pulse: 6 },
  },
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

class GhidorahBase {
  constructor(gltf, scene, fx, events, military, kind) {
    this.scene = scene;
    this.fx = fx;
    this.events = events;
    this.military = military;
    this.kind = kind;
    this.K = KINDS[kind];
    const mecha = kind === 'mecha';
    const get = n => gltf.scene.getObjectByName(n);
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.scale.setScalar(SCALE);
    scene.add(this.group);
    this.mesh = this.group;                       // Mini-Map und Schrei-Ziel lesen mesh.position
    const body = get(mecha ? 'MGH_body' : 'GH_body').clone();
    body.position.set(0, 0, 0);
    this.group.add(body);
    let skin = null;
    body.traverse(o => { if (o.isMesh && !skin) skin = o.material; });
    // leichter Eigenschimmer, damit Gold und Chrom nachts nicht zur Silhouette werden (Materialien sind geteilt)
    gltf.scene.traverse(o => {
      if (o.isMesh && /GH_Scale|GH_Membrane|MGH_Chrome|GH_Horn/.test(o.material.name) && !o.material.userData.glow) {
        o.material.userData.glow = true;
        o.material.emissive.setRGB(...(/MGH/.test(o.material.name) ? [0.05, 0.05, 0.06] : [0.09, 0.06, 0.01]));
      }
    });
    // Flügel: Gelenk an der Schulter, der rechte gespiegelt
    this.wings = [1, -1].map(sx => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * WING_ROOT[0], WING_ROOT[1], WING_ROOT[2]);
      const w = get(mecha ? 'MGH_wing' : 'GH_wing').clone();
      w.position.set(0, 0, 0);
      w.scale.set(sx, 1, 1);
      pivot.add(w);
      this.group.add(pivot);
      pivot.userData.sx = sx;
      return pivot;
    });
    // Hälse mit Köpfen (Mecha: Mittelkopf mechanisch), Schwänze
    const neckCol = mecha ? [0.55, 0.42, 0.12] : [0.75, 0.5, 0.12];
    this.necks = NECK_ROOTS.map((r, i) => {
      const c = new Chain(scene, skin, NECK_LEN * SCALE, 4.8 * SCALE, 3.3 * SCALE, { color: neckCol, rings: 10 });
      c.visible = false;
      c.root = new THREE.Vector3(...r);
      c.side = i === 0 ? 0 : (r[0] > 0 ? 1 : -1);
      c.head = get(mecha && i === 0 ? 'MGH_head' : 'GH_head').clone();
      c.head.scale.setScalar(SCALE);
      c.head.visible = false;
      scene.add(c.head);
      c.mouth = new THREE.Vector3();
      c.target = { mesh: { position: c.mouth }, hp: 1 };
      return c;
    });
    this.tails = TAIL_ROOTS.map(r => {
      const c = new Chain(scene, skin, TAIL_LEN * SCALE, 4.6 * SCALE, 0.9 * SCALE, { color: neckCol, rings: 18 });
      c.visible = false;
      c.root = new THREE.Vector3(...r);
      return c;
    });
    // Strahlen: Gravitationsstrahlen gold, beim Mecha-Mittelkopf ein orangeroter Laser; ohne eigene Lichter
    this.beams = this.necks.map((n, i) => {
      const b = new Beam(scene);
      const laser = mecha && i === 0;
      b.layers[0].material.uniforms.uColor.value.setRGB(...(laser ? [2.0, 0.35, 0.1] : [1.7, 1.2, 0.2]));
      b.layers[1].material.uniforms.uColor.value.setRGB(...(laser ? [2.4, 1.4, 0.8] : [2.6, 2.3, 1.2]));
      b.impact.material.uniforms.uColor.value.setRGB(1.8, 1.2, 0.3);
      scene.remove(b.light, b.mouthLight);
      b.t = 0;
      return b;
    });
    this.bodyTarget = { mesh: { position: new THREE.Vector3() }, hp: 1 };
    this.active = false;
    this.dead = false;
    this.hp = this.K.hp;
    this.t = 0;
  }

  get label() { return this.kind === 'mecha' ? 'MECHA-KING GHIDORAH' : 'KING GHIDORAH'; }

  appear(gz, city) {
    this.city = city;
    this.active = true;
    this.dead = false;
    this.hp = this.K.hp;
    this.state = 'arrive';
    this.st = 0;
    this.beamT = 4;
    this.trioT = this.K.trioEvery;
    this.landT = this.K.landEvery;
    this.grabT = this.K.grabEvery || 0;
    this.group.position.set(gz.x + 200, 200, gz.z - 650);
    this.group.visible = true;
    for (const c of [...this.necks, ...this.tails]) c.visible = true;
    for (const n of this.necks) n.head.visible = true;
  }

  fighting() { return this.active && !this.dead && this.state !== 'arrive'; }

  targets() {
    if (!this.fighting()) return [];
    return this.necks.map(n => n.target).concat(this.bodyTarget);
  }

  rayHit(o, d, max) {
    if (!this.active || this.dead) return max;
    const c = _a.copy(this.group.position).setY(this.group.position.y + CHEST);
    const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
    const t = ox * d.x + oy * d.y + oz * d.z, q = ox * ox + oy * oy + oz * oz - t * t;
    if (t < 0 || q > RADIUS * RADIUS) return max;
    return Math.min(max, t - Math.sqrt(RADIUS * RADIUS - q));
  }

  update(dt, g) {
    if (!this.active) return;
    this.t += dt;
    this.st += dt;
    const G = this.group, p = G.position, gp = g.position, K = this.K;
    const dx = gp.x - p.x, dz = gp.z - p.z, dist = Math.hypot(dx, dz);
    if (this.dead) { this.crash(dt); this.updateParts(dt, g, dist); return; }
    // Flug: kreist in Strahlweite, landet ab und zu vor Godzilla
    let alt = K.alt + 6 * Math.sin(this.t * 0.7), want = (K.range[0] + K.range[1]) / 2 + 20 * Math.sin(this.t * 0.25);
    if (this.state === 'arrive') { alt = 120; want = K.range[1]; if (dist < K.range[1] + 60) { this.state = 'fly'; this.st = 0; this.events.emit('ghidorahArrive', {}); } }
    else if (this.state === 'fly' && (this.landT -= dt) <= 0) { this.state = 'land'; this.st = 0; }
    if (this.state === 'land') {
      alt = 0; want = 95;
      if (this.st > K.landDur) { this.state = 'fly'; this.st = 0; this.landT = K.landEvery * (0.8 + 0.4 * Math.random()); }
    }
    if (this.hold) { alt = 40; want = 70; }
    const speed = this.state === 'arrive' ? 70 : 32;
    this.orbit = (this.orbit || 0.05) ;
    const ang = Math.atan2(p.z - gp.z, p.x - gp.x) + (this.state === 'land' || this.hold ? 0 : this.orbit * dt);
    const r = dist + THREE.MathUtils.clamp(want - dist, -speed * dt, speed * dt);
    p.x = gp.x + Math.cos(ang) * r;
    p.z = gp.z + Math.sin(ang) * r;
    p.y += (alt - p.y) * Math.min(1, dt * (this.state === 'land' ? 0.9 : 0.6));
    if (this.state !== 'land' && this.city) this.avoid();
    // Landung: Staub und Beben beim Aufsetzen
    if (this.state === 'land' && p.y < 3 && !this.landed) {
      this.landed = true;
      this.events.emit('shake', 1.2);
      this.fx.dust.emit(p.x, 0, p.z, 24, { spread: 50, up: 6, out: 18, size: 30, life: 4 });
      if (this.city) this.city.damage(p.clone(), 40, 200, p.clone(), true, 20);
    }
    if (p.y > 8) this.landed = false;
    // Körper zu Godzilla
    const yaw = Math.atan2(dx, dz);
    let dy = yaw - G.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    G.rotation.y += THREE.MathUtils.clamp(dy, -1.2 * dt, 1.2 * dt);
    G.rotation.x = this.state === 'land' ? 0 : 0.12;          // im Flug leicht nach vorn geneigt
    G.updateMatrixWorld(true);
    this.bodyTarget.mesh.position.set(p.x, p.y + CHEST, p.z);
    this.attacks(dt, g, dist);
    this.updateParts(dt, g, dist);
  }

  // Weicht Hochhäusern aus, die über die Flughöhe ragen
  avoid() {
    const p = this.group.position;
    for (const b of this.city.buildings) {
      if (!b.alive || b.h < p.y + 10) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      const ox = Math.abs(dx) - b.hw - 30, oz = Math.abs(dz) - b.hd - 30;
      if (ox >= 0 || oz >= 0) continue;
      if (ox > oz) p.x += Math.sign(dx || 1) * -ox; else p.z += Math.sign(dz || 1) * -oz;
    }
  }

  attacks(dt, g, dist) {
    const K = this.K;
    if (this.state === 'arrive' || g.state === 'dead') return;
    // Gravitationsstrahlen: ein Kopf nach dem anderen, ab und zu alle drei
    if (!this.hold && (this.beamT -= dt) <= 0 && dist < 420) {
      this.beamT = K.beamEvery * (0.8 + 0.4 * Math.random());
      const free = this.beams.filter(b => b.t <= 0);
      const b = free[Math.floor(Math.random() * free.length)];
      if (b) { b.t = K.beamDur; this.events.emit('gravityBeam', {}); }
    }
    if (!this.hold && (this.trioT -= dt) <= 0 && dist < 380) {
      this.trioT = K.trioEvery * (0.8 + 0.4 * Math.random());
      for (const b of this.beams) b.t = K.beamDur * 1.3;
      this.events.emit('gravityBeam', { all: true });
    }
  }

  // Hälse, Köpfe, Schwänze, Flügel und Strahlen
  updateParts(dt, g, dist) {
    const G = this.group, M = G.matrixWorld, grounded = this.group.position.y < 6 && !this.dead;
    const chest = _c.copy(g.position).setY(48);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(G.quaternion).setY(0).normalize();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    // Flügel schlagen im Flug kräftig, am Boden halb angelegt
    const flap = grounded ? 0.35 + 0.08 * Math.sin(this.t * 1.5) : 0.15 + 0.62 * Math.sin(this.t * (this.dead ? 9 : 3.4));
    for (const w of this.wings) w.rotation.set(0, w.userData.sx * -0.35, w.userData.sx * flap);
    // Hälse: S-Bogen nach oben und außen, Köpfe pendeln und schauen zu Godzilla; beim Strahl genau auf ihn
    this.necks.forEach((n, i) => {
      const root = n.root.clone().applyMatrix4(M);
      const L = n.len, ph = n.phase + this.t;
      const sway = new THREE.Vector3(Math.sin(ph * 1.1) * 4, Math.sin(ph * 1.7) * 3, Math.cos(ph * 0.9) * 4);
      let tip = root.clone().addScaledVector(fwd, L * 0.35).addScaledVector(right, n.side * L * 0.4).addScaledVector(UP, L * 0.7).add(sway);
      const beam = this.beams[i];
      if (beam.t > 0) tip.addScaledVector(fwd, L * 0.15);
      if (this.biteHead === i) tip.lerp(chest, ease(Math.min(1, this.biteT2 / 0.3)));
      if (this.dead) tip.addScaledVector(UP, -L * 0.9);
      const c1 = root.clone().addScaledVector(UP, L * 0.35).addScaledVector(right, n.side * L * 0.1);
      const c2 = tip.clone().addScaledVector(fwd, -L * 0.3);
      n.smooth ??= tip.clone();
      n.smooth.lerp(tip, 1 - Math.exp(-4 * dt));
      const aim = chest.clone().sub(n.smooth).normalize();
      n.pose(root, c1, c2, n.smooth, aim);
      // Kopf auf die Halsspitze, schaut zum Ziel (Kopf-oben bleibt oben)
      n.head.position.copy(n.tip);
      n.head.up.set(0, 1, 0);
      n.head.lookAt(_a.copy(n.tip).addScaledVector(aim, 10));
      n.mouth.copy(n.tip).addScaledVector(aim, 16 * SCALE);
      // Strahl
      if (beam.t > 0) {
        beam.t -= dt;
        const dir = _b.copy(chest).add(new THREE.Vector3(Math.sin(this.t * 7 + i) * 3, Math.sin(this.t * 5 + i) * 3, 0)).sub(n.mouth);
        const len = dir.length(); dir.normalize();
        const max = this.city ? Math.min(len, this.city.raycast(n.mouth, dir, len)) : len;
        const end = beam.update(dt, true, n.mouth, dir, max);
        if (end) this.beamHit(g, end, max < len - 2, dt, i);
      } else beam.update(dt, false);
    });
    // Schwänze: im Flug hängen sie nach hinten unten und schwingen, am Boden liegen sie hinter dem Körper
    this.tails.forEach((c, i) => {
      const root = c.root.clone().applyMatrix4(M);
      const L = c.len, side = i ? -1 : 1, ph = c.phase + this.t;
      let tip = root.clone().addScaledVector(fwd, -L * 0.75).addScaledVector(right, side * L * 0.25 + Math.sin(ph) * 10);
      tip.y = grounded ? 2 : root.y - L * 0.55 + Math.sin(ph * 1.3) * 6;
      const c1 = root.clone().addScaledVector(fwd, -L * 0.3).addScaledVector(UP, -L * 0.1);
      const c2 = tip.clone().addScaledVector(fwd, L * 0.2).setY(grounded ? 2 : tip.y + L * 0.15);
      c.pose(root, c1, c2, tip, tip.clone().sub(root));
    });
  }

  beamHit(g, end, blocked, dt, i) {
    if (Math.random() < dt * 14) this.fx.fire.emit(end.x, end.y, end.z, 1, { spread: 4, up: 3, out: 6, size: 12, life: 0.5 });
    if (blocked) {                               // ein Gebäude fängt den Strahl ab
      this.city.damage(end.clone(), 14, 160 * dt, this.group.position, false, end.y);
      return;
    }
    const laser = this.kind === 'mecha' && i === 0;
    g.takeDamage(this.K.beamDps * (laser ? 1.2 : 1) * dt, end);
  }

  // ---------- Schaden durch Godzilla ----------
  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const p = this.group.position, D = this.K.dmg;
    if (e.kind === 'pulse') {
      if (this.hold) this.release(this.g, 'pulse');
      if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 150 && p.y < 100) this.damage(D.pulse, true);
      return;
    }
    if (p.y > 30) return;                         // im Flug außer Reichweite von Klaue und Schwanz
    const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - RADIUS;
    if (d < e.radius + 6) this.damage(e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw, true);
  }

  beamLine(from, to, dps, dt) {
    if (!this.fighting()) return;
    if (this.hold && this.g && this.g.firing && (this.holdFire = (this.holdFire || 0) + dt) > 1.0) this.release(this.g, 'beam');
    const D = this.K.dmg;
    const head = this.necks.find(n => to.distanceTo(n.mouth) < 14 || to.distanceTo(n.tip) < 12);
    if (head) { this.damage(D.head * dt); return; }
    if (to.distanceTo(this.bodyTarget.mesh.position) < RADIUS + 8) this.damage(D.beam * dt);
  }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.bodyTarget.mesh.position, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp <= 0) this.down();
  }

  down() {
    this.dead = true;
    this.vy = 0;
    if (this.hold) this.release(this.g, 'timeout');
    for (const b of this.beams) b.t = 0;
    this.onDown();
  }

  // Absturz: trudelt brennend zu Boden
  crash(dt) {
    const p = this.group.position;
    this.vy -= 18 * dt;
    p.y = Math.max(0, p.y + this.vy * dt);
    this.group.rotation.z += dt * 0.5;
    this.fx.fire.emit(p.x, p.y + CHEST, p.z, 2, { spread: 14, up: 4, out: 4, size: 18, life: 0.9 });
    this.fx.dust.emit(p.x, p.y + CHEST, p.z, 1, { spread: 10, up: 4, out: 2, size: 24, life: 4, color: [0.08, 0.08, 0.08] });
    if (p.y <= 0.5 && !this.crashed) {
      this.crashed = true;
      this.military.boom(p, 2.5);
      this.fx.dust.emit(p.x, 0, p.z, 30, { spread: 50, up: 6, out: 18, size: 30, life: 6 });
      if (this.city) this.city.damage(p.clone(), 60, 400, p.clone(), true, 30);
      this.events.emit('shake', 2.5);
      this.goneT = 3;
    }
    if (this.crashed && (this.goneT -= dt) <= 0 && this.active) {
      this.active = false;
      this.group.visible = false;
      for (const c of [...this.necks, ...this.tails]) c.visible = false;
      for (const n of this.necks) n.head.visible = false;
      for (const b of this.beams) b.update(dt, false);
      this.onGone();
    }
  }

  release() {}
  onDown() {}
  onGone() {}
}

// ---------- King Ghidorah: Boss (wie die Super-X: start(), update(dt, g, city), Absturz -> bossCrash) ----------
export class KingGhidorah extends GhidorahBase {
  constructor(units, scene, fx, events, military, models) {
    super(models.ghidorah, scene, fx, events, military, 'king');
  }

  start(gz) {
    this.appear(gz, this.city);
    this.events.emit('bossStart', {});
  }

  update(dt, g, city) {
    this.city = city;
    this.g = g;
    super.update(dt, g);
    // Biss am Boden: steht Godzilla nah davor, schnappt ein Kopf zu
    if (this.fighting() && this.state === 'land' && this.group.position.y < 4) {
      const d = Math.hypot(g.position.x - this.group.position.x, g.position.z - this.group.position.z);
      if (this.biteHead === undefined || this.biteHead === null) {
        if (d < 110 && (this.biteCD = (this.biteCD || 0) - dt) <= 0) { this.biteHead = 1 + Math.floor(Math.random() * 2); this.biteT2 = 0; }
      } else {
        this.biteT2 += dt;
        if (this.biteT2 > 0.3 && !this.bitten) { this.bitten = true; if (d < 120) g.takeDamage(this.K.biteDmg, g.position); this.events.emit('vineBite', {}); }
        if (this.biteT2 > 0.9) { this.biteHead = null; this.bitten = false; this.biteCD = 2.5; }
      }
    } else this.biteHead = null;
  }

  onDown() { this.events.emit('bossDown', {}); }
  onGone() { this.events.emit('bossCrash', { pos: this.group.position.clone() }); }
  beamLine(from, to, dt) { super.beamLine(from, to, 220, dt); }
}

// ---------- Mecha-King Ghidorah: Endgegner (wie Biollante: start(gz, city), fighting(), finalRise ...) ----------
export class MechaKingGhidorah extends GhidorahBase {
  constructor(gltf, scene, fx, events, glow, military) {
    super(gltf, scene, fx, events, military, 'mecha');
    // Fangklammern: zwei Stahlseile vom Brustpanzer zu Godzillas Schultern
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.9, roughness: 0.35 });
    this.cables = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2), mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
  }

  start(gz, city) {
    this.appear(gz, city);
    this.events.emit('finalRise', { title: 'MECHA-KING GHIDORAH' });
  }

  update(dt, g) {
    this.g = g;
    super.update(dt, g);
    if (!this.fighting()) { for (const c of this.cables) c.visible = false; return; }
    const d = Math.hypot(g.position.x - this.group.position.x, g.position.z - this.group.position.z);
    if (!this.hold && this.state === 'fly' && (this.grabT -= dt) <= 0 && d < 230 && g.state !== 'dead') {
      this.hold = { t: 0 };
      this.holdFire = 0;
      g.held = 'vines';
      this.events.emit('grabStart', {});
    }
    if (this.hold) {
      const h = this.hold;
      h.t += dt;
      g.speedCap = 0;
      g.takeDamage(this.K.grabDps * dt, g.position);
      g.hurt = 0;
      if (Math.random() < dt * 3) this.events.emit('shake', 0.25);
      if (h.t > this.K.grabMax) this.release(g, 'timeout');
    } else g.speedCap = Infinity;
    // Seile
    this.cables.forEach((c, i) => {
      c.visible = !!this.hold;
      if (!this.hold) return;
      const from = _a.set(i ? -6 : 6, 50, 12).applyMatrix4(this.group.matrixWorld);
      const to = _b.copy(g.position).add(new THREE.Vector3(i ? -9 : 9, 58, 0).applyAxisAngle(UP, g.heading));
      c.position.copy(from); c.lookAt(to); c.scale.set(1, 1, from.distanceTo(to));
    });
  }

  release(g, how) {
    if (!this.hold) return;
    this.hold = null;
    if (g) { g.held = null; g.speedCap = Infinity; }
    this.grabT = this.K.grabEvery * (0.8 + 0.4 * Math.random());
    this.events.emit('holdFree', { kind: 'grab', how });
    if (how !== 'timeout') { this.damage(8, true); this.military.boom(this.bodyTarget.mesh.position, 1.0); }
  }

  onDown() { this.events.emit('finalDown', { title: 'MECHA-KING GHIDORAH STÜRZT AB' }); }
  onGone() { this.events.emit('finalGone', {}); }
}
