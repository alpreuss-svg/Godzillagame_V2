// 1994: Moguera (Boss) und SpaceGodzilla (Endgegner). Modelle aus kaiju94.glb, SpaceGodzilla aus godzilla.glb.
// Moguera: landet mit Triebwerken, rollt auf Ketten heran und walzt Gebäude nieder, Plasma-Maser aus den Augen,
// Spiralraketen aus den Händen; gräbt sich mit dem Nasenbohrer ein, wühlt unter der Erde auf Godzilla zu (Staubspur)
// und bricht unter ihm hervor. Nach dem Auftauchen ist er kurz benommen (doppelter Schaden).
// SpaceGodzilla: umgefärbte Kopie von Godzilla mit Kristallen auf den Schultern, schwebt, Korona-Strahl, Kristall-
// geschosse, Gravitationssog (hält fest, nur der Kernpuls befreit). Seine Kraft fließt über den Fukuoka Tower und
// Kristalltürme in der Stadt: solange der Turm steht, wehrt ein Schild den meisten Schaden ab; jeder Kristallturm heilt
// ihn. Kristalltürme lassen sich mit allen Angriffen zerstören.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeBeam, fireBeam, faceTo, sphereHit, UP } from './kaiju.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const NOSE = [0, 64, 9], HAND = [14, 34, 12];      // Bohrer (blender/kaiju94.py DRILLS, glTF x, z, -y)

// Kleine Lenkgeschosse (Spiralraketen, Kristallsplitter): Kugel mit Leuchtspur
class Missiles {
  constructor(scene, fx, color, size) {
    this.scene = scene; this.fx = fx; this.list = [];
    this.geo = new THREE.SphereGeometry(size, 8, 6);
    this.mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    this.trail = color;
  }
  fire(from, g, speed, dmg) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(from);
    this.scene.add(m);
    const vel = _a.copy(g.position).setY(g.position.y + 50).sub(from).normalize().multiplyScalar(speed).add(new THREE.Vector3((Math.random() - 0.5) * 30, 25, (Math.random() - 0.5) * 30));
    this.list.push({ m, mesh: m, vel: vel.clone(), dmg, life: 5, hp: 1 });   // mesh: für die Zielerfassung
  }
  update(dt, g, city, color) {
    this.list = this.list.filter(s => {
      s.life -= dt;
      const p = s.m.position;
      const to = _b.copy(g.position).setY(g.position.y + 48).sub(p);
      s.vel.lerp(to.normalize().multiplyScalar(s.vel.length()), Math.min(1, 1.6 * dt));
      p.addScaledVector(s.vel, dt);
      if (Math.random() < 0.5) this.fx.dust.emit(p.x, p.y, p.z, 1, { spread: 0.5, up: 0.3, out: 0.4, size: 4, life: 0.8, color });
      const hit = Math.hypot(p.x - g.position.x, p.z - g.position.z) < 15 && p.y > g.position.y + 5 && p.y < g.position.y + 80;
      if (hit) { g.takeDamage(s.dmg, p); this.fx.fire.emit(p.x, p.y, p.z, 4, { spread: 3, up: 3, out: 6, size: 10, life: 0.5 }); }
      if (hit || s.life <= 0 || p.y < 0 || (city && city.inside(p))) { this.scene.remove(s.m); s.hp = 0; return false; }
      return true;
    });
  }
  // vom Atomstrahl abschießbar
  beamLine(from, to) {
    const ab = _c.subVectors(to, from), l2 = ab.lengthSq();
    this.list = this.list.filter(s => {
      const t = THREE.MathUtils.clamp(_a.subVectors(s.m.position, from).dot(ab) / l2, 0, 1);
      if (_b.copy(from).addScaledVector(ab, t).distanceTo(s.m.position) > 10) return true;
      this.fx.fire.emit(s.m.position.x, s.m.position.y, s.m.position.z, 3, { spread: 2, up: 2, out: 4, size: 8, life: 0.4 });
      this.scene.remove(s.m); s.hp = 0;
      return false;
    });
  }
}

// ======================= Moguera (Boss) =======================
const MOG = { hp: 100, speed: 10, maserEvery: 4.5, maserDur: 1.5, maserDps: 3.5, missileEvery: 8, missileDmg: 1.6,
  burrowEvery: 16, digSpeed: 40, eruptDmg: 7, dazed: 2.5, dmg: { beam: 4, claw: 5, tail: 7, pulse: 8 } };

export class Moguera {
  constructor(units, scene, fx, events, military, models) {
    const gltf = models.kaiju94;
    this.scene = scene; this.fx = fx; this.events = events; this.military = military;
    const get = n => { const o = gltf.scene.getObjectByName(n).clone(); o.position.set(0, 0, 0); return o; };
    this.group = new THREE.Group();
    this.group.scale.setScalar(1.2);
    this.group.visible = false;
    scene.add(this.group);
    this.group.add(get('MOG_body'));
    this.drills = [[...NOSE], [HAND[0], HAND[1], HAND[2]], [-HAND[0], HAND[1], HAND[2]]].map(pos => {
      const d = get('MOG_drill'); d.position.set(...pos); this.group.add(d); return d;
    });
    this.mesh = this.group;
    this.maser = makeBeam(scene, [1.8, 1.6, 0.6], [2.4, 2.4, 1.6]);
    this.missiles = new Missiles(scene, fx, 0xffd090, 1.4);
    this.center = new THREE.Vector3();
    this.bodyTarget = { mesh: { position: this.center }, hp: 1 };
    this.active = false; this.dead = false; this.hp = MOG.hp;
  }

  get label() { return 'MOGUERA'; }

  start(gz) {
    this.active = true; this.dead = false; this.hp = MOG.hp;
    this.state = 'land'; this.st = 0;
    this.group.position.set(gz.x + 160, 300, gz.z - 260);
    this.group.visible = true;
    this.maserT = 4; this.missileT = 6; this.burrowT = 12;
    this.events.emit('bossStart', {});
    this.events.emit('mogRoar', {});
  }

  fighting() { return this.active && !this.dead && (this.state === 'roll' || this.state === 'dazed'); }
  targets() { return this.fighting() ? [this.bodyTarget, ...this.missiles.list] : this.missiles.list; }
  rayHit(o, d, max) { return this.active && !this.dead && this.group.visible ? sphereHit(this.center, 22, o, d, max) : max; }
  stun(t) { if (this.fighting()) { this.stunT = t; this.maser.t = 0; } }

  update(dt, g, city) {
    this.city = city;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    const G = this.group, p = G.position, gp = g.position;
    const dist = Math.hypot(gp.x - p.x, gp.z - p.z);
    for (const d of this.drills) d.rotation.z += dt * (this.state === 'dig' || this.state === 'burrow' ? 25 : 6);
    if (this.dead) return this.explode(dt);
    if (this.state === 'land') {                                  // landet mit Triebwerken
      p.y = Math.max(0, p.y - 70 * dt);
      if (Math.random() < 0.6) this.fx.fire.emit(p.x, p.y + 2, p.z, 2, { spread: 6, up: -10, out: 3, size: 12, life: 0.4 });
      if (p.y <= 0) { this.state = 'roll'; this.st = 0; this.events.emit('shake', 1.2); this.fx.dust.emit(p.x, 0, p.z, 20, { spread: 40, up: 5, out: 16, size: 26, life: 4 }); }
    } else if (this.state === 'roll') {
      faceTo(G, gp, dt, 0.8);
      if (dist > 120 && !this.stunT) {
        p.x += Math.sin(G.rotation.y) * MOG.speed * dt; p.z += Math.cos(G.rotation.y) * MOG.speed * dt;
        if (city) city.crush(p.clone(), 22, dt);
      }
      if (!this.stunT) {
        if ((this.maserT -= dt) <= 0) { this.maserT = MOG.maserEvery * (0.8 + 0.4 * Math.random()); this.maser.t = MOG.maserDur; this.events.emit('prismBeam', {}); }
        if ((this.missileT -= dt) <= 0) {
          this.missileT = MOG.missileEvery * (0.8 + 0.4 * Math.random());
          for (let k = 0; k < 4; k++) this.missiles.fire(G.localToWorld(_c.set(k % 2 ? -HAND[0] : HAND[0], HAND[1], HAND[2] + 14)), g, 90, MOG.missileDmg);
          this.events.emit('mogMissiles', {});
        }
        if ((this.burrowT -= dt) <= 0) { this.state = 'burrow'; this.st = 0; this.events.emit('mogRoar', {}); }
      }
    } else if (this.state === 'burrow') {                         // bohrt sich ein
      p.y = -this.st * 20;
      this.fx.dust.emit(p.x, 2, p.z, 2, { spread: 20, up: 6, out: 10, size: 24, life: 3 });
      if (this.st > 2) { this.state = 'dig'; this.st = 0; G.visible = false; }
    } else if (this.state === 'dig') {                            // wühlt unter der Erde auf Godzilla zu
      const k = Math.min(1, MOG.digSpeed * dt / Math.max(1, dist));
      p.x += (gp.x - p.x) * k; p.z += (gp.z - p.z) * k;
      if (Math.random() < dt * 20) this.fx.dust.emit(p.x, 1, p.z, 1, { spread: 8, up: 4, out: 6, size: 16, life: 2 });
      if (city && Math.random() < dt * 6) { city.scars.blob(p.x, p.z, 10, [0, 0.4, 0.3]); city.damage(p.clone(), 16, 40, p.clone(), false, 3); }
      if (Math.random() < dt * 3) this.events.emit('shake', 0.3);
      if (dist < 25 || this.st > 8) {                             // bricht unter Godzilla hervor
        this.state = 'erupt'; this.st = 0; G.visible = true; p.y = -40;
        if (dist < 40) { g.takeDamage(MOG.eruptDmg, gp); this.events.emit('shake', 1.8); }
        if (city) city.damage(p.clone(), 40, 200, p.clone(), true, 10);
        this.fx.dust.emit(p.x, 2, p.z, 30, { spread: 30, up: 18, out: 18, size: 26, life: 3.5 });
        this.military.boom(p.clone().setY(2), 1.2);
        // ein Stück neben Godzilla auftauchen
        const a = Math.random() * 6.28; p.x = gp.x + Math.cos(a) * 60; p.z = gp.z + Math.sin(a) * 60;
      }
    } else if (this.state === 'erupt') {
      p.y = Math.min(0, p.y + 60 * dt);
      if (p.y >= 0) { this.state = 'dazed'; this.st = 0; this.events.emit('mogDazed', {}); }
    } else if (this.state === 'dazed') {                          // benommen: doppelter Schaden
      G.rotation.z = 0.08 * Math.sin(this.st * 8);
      if (this.st > MOG.dazed) { this.state = 'roll'; this.st = 0; G.rotation.z = 0; this.burrowT = MOG.burrowEvery * (0.8 + 0.4 * Math.random()); }
    }
    G.updateMatrixWorld(true);
    this.center.copy(p).setY(p.y + 45);
    if (this.maser.t > 0 && !this.stunT && this.state === 'roll') { this.maser.t -= dt; fireBeam(this.maser, dt, G.localToWorld(_c.set(0, 61, 11)), g, city, MOG.maserDps, this.fx); }
    else this.maser.update(dt, false);
    this.missiles.update(dt, g, city, [0.6, 0.55, 0.45]);
    if (G.visible && p.y > -5 && dist < 40 && dist > 0.01) { gp.x = p.x + (gp.x - p.x) / dist * 40; gp.z = p.z + (gp.z - p.z) / dist * 40; }
  }

  mult() { return this.state === 'dazed' ? 2 : 1; }

  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const c = this.center, D = MOG.dmg;
    const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z);
    if (e.kind === 'pulse') { if (d < 150) this.damage(D.pulse * this.mult(), true); return; }
    if (d < e.radius + 26) this.damage((e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw) * this.mult(), true);
  }

  beamLine(from, to, dt) {
    this.missiles.beamLine(from, to);
    if (this.fighting() && to.distanceTo(this.center) < 30) this.damage(MOG.dmg.beam * this.mult() * dt);
  }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.center, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    this.dead = true; this.st = 0; this.maser.t = 0;
    this.events.emit('bossDown', {});
  }

  explode(dt) {
    this.maser.update(dt, false);
    if (Math.random() < dt * 6) this.military.boom(this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30)), 1);
    this.group.rotation.z = Math.min(0.8, this.st * 0.3);
    if (this.st > 3 && this.active) {
      this.military.boom(this.group.position, 2.6);
      this.events.emit('shake', 2.2);
      this.group.visible = false; this.active = false;
      this.events.emit('bossCrash', { pos: this.group.position.clone() });
    }
  }
}

// ======================= SpaceGodzilla (Endgegner) =======================
const SG = { hp: 100, speed: 6, coronaEvery: 5, coronaDur: 2, coronaDps: 4.5, shardEvery: 9, shardDmg: 2,
  pullEvery: 20, pullDps: 2.2, pullMax: 7, shield: 0.3, regen: 0.6, towerRegen: 1.2, crystals: 4, crystalHp: 30,
  dmg: { beam: 4.5, claw: 5, tail: 7, pulse: 8, free: 8 } };

export class SpaceGodzilla {
  constructor(gltf, scene, fx, events, glow, military, models) {
    this.scene = scene; this.fx = fx; this.events = events; this.glow = glow; this.military = military;
    const src = models.godzilla;
    this.root = SkeletonUtils.clone(src.scene);
    this.root.scale.setScalar(1.08);
    this.root.visible = false;
    scene.add(this.root);
    // umfärben nach Filmbildern: dunkles Blau-Violett, rote Brust und roter Bauch, Rückenplatten weiß-rosa wie Kristall
    this.root.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (/Plates/.test(o.material.name)) { o.material.onBeforeCompile = () => {}; o.material.customProgramCacheKey = () => 'sg-plates';
        o.material.vertexColors = false;
        o.material.color.setRGB(1.0, 0.82, 0.88); o.material.emissive.setRGB(0.35, 0.16, 0.22); o.material.roughness = 0.2; o.material.needsUpdate = true; }
      else if (/Body/.test(o.material.name)) {
        o.geometry = o.geometry.clone();                              // eigene Vertexfarben (die Geometrie teilt sonst Godzilla)
        const pos = o.geometry.attributes.position, nor = o.geometry.attributes.normal, col = o.geometry.attributes.color;
        for (let i = 0; i < col.count; i++) {
          const l = Math.sqrt((col.getX(i) + col.getY(i) + col.getZ(i)) / 3 / 0.02);   // Helligkeit der Haut (Relief)
          const y = pos.getY(i), front = nor.getZ(i), chest = front > 0.35 && y > 28 && y < 63 && Math.abs(pos.getX(i)) < 11 - Math.abs(y - 46) * 0.2;
          const c = chest ? [0.42, 0.045, 0.07] : [0.022, 0.025, 0.06];
          col.setXYZ(i, c[0] * l, c[1] * l, c[2] * l);
        }
        o.material.color.setRGB(1.6, 1.6, 1.6); o.material.emissive.setRGB(0.02, 0.01, 0.04);
      }
      o.frustumCulled = false;
    });
    this.bones = {};
    this.root.traverse(o => { if (o.isBone) this.bones[o.name] = o; });
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const c of src.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.actions.idle.play();
    // Kristalle auf den Schultern und auf der Stirn
    const crystal = gltf.scene.getObjectByName('SG_crystal');
    this.root.updateMatrixWorld(true);
    const attach = (bone, pos, s, tilt, src = crystal) => {
      const c = src.clone(); c.scale.setScalar(s);
      const b = this.bones[bone], wp = this.root.localToWorld(new THREE.Vector3(...pos));
      c.position.copy(b.worldToLocal(wp));
      const wq = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt[0], 0, tilt[1]));
      c.quaternion.copy(b.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
      b.add(c);
      return c;
    };
    const big = gltf.scene.getObjectByName('SG_shoulder');            // riesige Schulterkristalle (weiß-rosa, rote Basis)
    big.traverse(o => { if (o.isMesh) o.material.emissive.setRGB(0.3, 0.16, 0.2); });   // leuchten nachts leicht
    attach('spine2', [12, 60, -4], 1.0, [-0.3, -0.35], big);
    attach('spine2', [-12, 60, -4], 1.0, [-0.3, 0.35], big);
    const horn = attach('head', [0, 79, 12], 0.22, [0.7, 0]);          // gelb-oranges Stirnhorn
    horn.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setRGB(1, 0.6, 0.15); o.material.emissive.setRGB(0.8, 0.4, 0.05); } });
    this.crystalSrc = crystal;
    this.corona = makeBeam(scene, [1.9, 1.3, 0.4], [2.4, 2.1, 1.2]);
    this.feeds = [];                                                  // Energieströme von Turm/Kristallen
    for (let i = 0; i < SG.crystals + 1; i++) this.feeds.push(makeBeam(scene, [0.6, 0.35, 1.4], [1.2, 1.0, 1.8]));
    for (const f of this.feeds) { f.layers[0].userData.r = 1.2; f.layers[1].userData.r = 0.5; f.impact.visible = false; }
    this.shards = new Missiles(scene, fx, 0xb08cff, 1.8);
    this.towers = [];
    this.center = new THREE.Vector3();
    this.bodyTarget = { mesh: { position: this.center }, hp: 1 };
    this.group = this.root;
    this.active = false; this.dead = false; this.hp = SG.hp;
  }

  get label() { return 'SPACEGODZILLA'; }

  start(gz, city) {
    this.city = city;
    this.active = true; this.dead = false; this.hp = SG.hp;
    this.state = 'arrive'; this.st = 0;
    this.root.position.set(gz.x + 100, 250, gz.z - 360);
    this.root.visible = true;
    this.coronaT = 5; this.shardT = 7; this.pullT = 12;
    this.ftower = city.buildings.find(b => b.type === 'ftower') || null;
    this.spawnCrystals(gz);
    this.events.emit('finalRise', { title: 'SPACEGODZILLA' });
    this.events.emit('sgRoar', {});
  }

  // Kristalltürme wachsen auf Blöcken rund um Godzilla
  spawnCrystals(gz) {
    for (const t of this.towers) this.scene.remove(t.mesh);
    this.towers = [];
    for (let i = 0; i < SG.crystals; i++) {
      const a = i * Math.PI * 2 / SG.crystals + Math.random() * 0.6, r = 200 + Math.random() * 120;
      const x = gz.x + Math.cos(a) * r, z = Math.min(this.city.bayZ - 40, gz.z + Math.sin(a) * r);
      const m = this.crystalSrc.clone(); m.scale.setScalar(1.6 + Math.random() * 0.5); m.position.set(x, -40, z); m.rotation.y = Math.random() * 6;
      this.scene.add(m);
      this.towers.push({ mesh: m, hp: SG.crystalHp, alive: true, grow: 0, tip: new THREE.Vector3(x, 45, z) });
      if (this.city) this.city.damage(new THREE.Vector3(x, 0, z), 30, 400, new THREE.Vector3(x, 0, z), true, 10);
    }
  }

  fighting() { return this.active && !this.dead && this.state !== 'arrive'; }
  towerUp() { return !!(this.ftower && this.ftower.alive); }
  targets() { return this.fighting() ? [this.bodyTarget, ...this.towers.filter(t => t.alive).map(t => ({ mesh: { position: t.tip }, hp: 1 })), ...this.shards.list] : []; }
  rayHit(o, d, max) {
    if (!this.active || this.dead) return max;
    let m = sphereHit(this.center, 22, o, d, max);
    for (const t of this.towers) if (t.alive) m = sphereHit(t.tip, 14, o, d, m);
    return m;
  }
  stun(t) { if (this.fighting()) { this.stunT = t; this.corona.t = 0; } }

  play(name) {
    if (this.cur === name) return;
    const next = this.actions[name];
    if (!next) return;
    next.reset().play();
    if (this.cur) this.actions[this.cur].crossFadeTo(next, 0.4, false);
    this.cur = name;
  }

  update(dt, g) {
    this.g = g;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    const R = this.root, p = R.position, gp = g.position, city = this.city;
    this.mixer.update(dt);
    if (this.dead) return this.fall(dt);
    const dist = Math.hypot(gp.x - p.x, gp.z - p.z);
    if (this.state === 'arrive') {
      p.y = Math.max(6, p.y - 50 * dt);
      if (Math.random() < 0.5) this.glow.emit(p.x, p.y + 40, p.z, 2, { spread: 20, up: -4, out: 6, size: 9, life: 1.5, color: [0.7, 0.5, 1.0] });
      if (p.y <= 6.1) { this.state = 'fight'; this.st = 0; this.events.emit('shake', 1.4); this.events.emit('sgRoar', {}); }
    } else {
      faceTo(R, gp, dt, 0.7);
      const move = dist > 150 && !this.hold && !this.stunT;
      if (move) { p.x += Math.sin(R.rotation.y) * SG.speed * dt; p.z += Math.cos(R.rotation.y) * SG.speed * dt; if (city) city.crush(p.clone(), 18, dt); }
      p.y = 6 + 2 * Math.sin(this.st * 1.3);                       // schwebt
      this.play(move ? 'walk' : 'idle');
      this.attacks(dt, g, dist);
      this.updateFeeds(dt);
      this.updatePull(dt, g);
    }
    R.updateMatrixWorld(true);
    this.center.copy(p).setY(p.y + 50);
    // Kristalltürme wachsen aus dem Boden
    for (const t of this.towers) if (t.alive && t.grow < 1) { t.grow = Math.min(1, t.grow + dt * 0.4); t.mesh.position.y = -40 + 40 * t.grow; }
    if (this.corona.t > 0 && !this.stunT) { this.corona.t -= dt; fireBeam(this.corona, dt, this.bones.head.localToWorld(_c.set(0, 2, 12)), g, city, SG.coronaDps, this.fx); }
    else this.corona.update(dt, false);
    this.shards.update(dt, g, city, [0.6, 0.45, 0.9]);
    if (dist < 40 && dist > 0.01) { gp.x = p.x + (gp.x - p.x) / dist * 40; gp.z = p.z + (gp.z - p.z) / dist * 40; }
  }

  attacks(dt, g, dist) {
    if (this.stunT || this.hold) return;
    if ((this.coronaT -= dt) <= 0) { this.coronaT = SG.coronaEvery * (0.8 + 0.4 * Math.random()); this.corona.t = SG.coronaDur; this.events.emit('prismBeam', {}); }
    if ((this.shardT -= dt) <= 0) {
      this.shardT = SG.shardEvery * (0.8 + 0.4 * Math.random());
      for (let k = 0; k < 3; k++) this.shards.fire(this.root.localToWorld(_c.set(k % 2 ? -11 : 11, 70, 0)), g, 80, SG.shardDmg);
      this.events.emit('mogMissiles', {});
    }
    if ((this.pullT -= dt) <= 0 && dist < 260) { this.pullT = SG.pullEvery; this.hold = { t: 0 }; g.held = 'vines'; this.events.emit('grabStart', { kind: 'gravity' }); }
  }

  // Energie: der Fukuoka Tower schützt, Kristalltürme heilen; sichtbar als violette Ströme
  updateFeeds(dt) {
    const src = [];
    if (this.towerUp()) src.push(new THREE.Vector3(this.ftower.x, 200, this.ftower.z));
    for (const t of this.towers) if (t.alive && t.grow >= 1) src.push(t.tip);
    this.feeds.forEach((f, i) => {
      const s = src[i];
      if (!s) { f.update(dt, false); return; }
      const dir = this.center.clone().sub(s), len = dir.length(); dir.normalize();
      f.update(dt, true, s, dir, len);
      f.impact.visible = false;
    });
    const heal = this.towers.filter(t => t.alive && t.grow >= 1).length * SG.regen + (this.towerUp() ? SG.towerRegen : 0);
    this.hp = Math.min(SG.hp, this.hp + heal * dt * 0.25);
  }

  updatePull(dt, g) {
    if (!this.hold) return;
    const h = this.hold;
    h.t += dt;
    g.speedCap = 0;
    g.takeDamage(SG.pullDps * dt, g.position);
    g.hurt = 0;
    if (Math.random() < 0.6) this.glow.emit(g.position.x, g.position.y + Math.random() * 70, g.position.z, 1, { spread: 22, up: 14, out: -4, size: 8, life: 1.2, color: [0.6, 0.45, 1.0] });
    if (h.t > SG.pullMax) this.release(g, 'timeout');
  }

  release(g, how) {
    if (!this.hold) return;
    this.hold = null;
    if (g) { g.held = null; g.speedCap = Infinity; }
    this.events.emit('holdFree', { kind: 'grab', how });
    if (how === 'pulse') this.damage(SG.dmg.free, true);
  }

  mult() { return this.towerUp() ? SG.shield : 1; }

  hitTowers(test, amount) {
    for (const t of this.towers) {
      if (!t.alive || !test(t)) continue;
      t.hp -= amount;
      if (t.hp <= 0) {
        t.alive = false;
        this.scene.remove(t.mesh);
        this.glow.emit(t.tip.x, t.tip.y - 20, t.tip.z, 30, { spread: 16, up: 10, out: 14, size: 10, life: 1.6, color: [0.7, 0.5, 1.0] });
        this.military.boom(t.tip.clone().setY(10), 1);
        this.events.emit('crystalDown', { left: this.towers.filter(x => x.alive).length });
      }
    }
  }

  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const D = SG.dmg;
    this.hitTowers(t => Math.hypot(e.pos.x - t.tip.x, e.pos.z - t.tip.z) < e.radius + 14, e.kind === 'pulse' ? 40 : e.damage * 0.5);
    if (e.kind === 'pulse' && this.hold) this.release(this.g, 'pulse');
    const c = this.center, d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z);
    if (e.kind === 'pulse') { if (d < 150) this.damage(D.pulse * this.mult(), true); return; }
    if (d < e.radius + 26) this.damage((e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw) * this.mult(), true);
  }

  beamLine(from, to, dps, dt) {
    if (!this.fighting()) return;
    this.shards.beamLine(from, to);
    this.hitTowers(t => to.distanceTo(t.tip) < 20, 20 * dt);
    if (to.distanceTo(this.center) < 30) {
      this.damage(SG.dmg.beam * this.mult() * dt);
      if (this.towerUp() && Math.random() < dt * 14) this.glow.emit(to.x, to.y, to.z, 2, { spread: 4, up: 3, out: 12, size: 8, life: 0.5, color: [0.7, 0.5, 1.0] });
    }
  }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.center, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    this.dead = true; this.st = 0; this.corona.t = 0;
    if (this.hold) this.release(this.g, 'timeout');
    for (const f of this.feeds) f.update(0, false);
    this.events.emit('sgRoar', {});
    this.events.emit('finalDown', { title: 'SPACEGODZILLA IST BESIEGT' });
  }

  // zerfällt in Kristallsplitter
  fall(dt) {
    this.corona.update(dt, false);
    const p = this.root.position;
    if (Math.random() < dt * 30) this.glow.emit(p.x, p.y + Math.random() * 80, p.z, 2, { spread: 16, up: 8, out: 10, size: 9, life: 2, color: [0.7, 0.5, 1.0] });
    this.root.scale.setScalar(Math.max(0.01, 1.08 * (1 - this.st / 4)));
    if (this.st > 4 && this.active) {
      this.military.boom(p, 2.4); this.events.emit('shake', 2);
      this.root.visible = false; this.active = false;
      for (const t of this.towers) this.scene.remove(t.mesh);
      this.events.emit('finalGone', {});
    }
  }
}
