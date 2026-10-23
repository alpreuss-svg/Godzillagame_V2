// 1993: Rodan (Boss, zwei Stufen) und Mechagodzilla (Endgegner). Modelle aus kaiju93.glb.
// Rodan: fliegt, stürzt sich mit Überschallknall herab (Druckwelle reißt Gebäude um). Besiegt stürzt er ab und erhebt
// sich glühend als Fire Rodan: zusätzlich orangefarbener Strahl aus dem Schnabel. Fällt Fire Rodan, geht seine
// Lebensenergie auf Godzilla über (Heilung, volle Energie, stärkerer Atomstrahl für den Rest des Levels).
// Mechagodzilla: geht schwerfällig auf Godzilla zu (Gelenkteile, prozeduraler Gang), Augenlaser, Mega-Buster aus dem
// Maul, Schockanker (halten fest, nur der Kernpuls befreit). Plasmagranate: Strahltreffer von vorn saugt die Brust auf
// und schießt sie verstärkt zurück; Treffer von hinten treffen das zweite Gehirn in der Hüfte (vielfacher Schaden).
// Bei halber Kraft dockt Garuda an: Super-Mechagodzilla mit zwei Rückenkanonen.
import * as THREE from 'three';
import { Chain } from './chain.js';
import { Moth, makeBeam, fireBeam, orbit, faceTo, sphereHit, clearAlt, UP } from './kaiju.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const RO_WING = [5.5, 2, 1];
// Gelenke aus blender/kaiju93.py (Blender x, y, z -> glTF x, z, -y)
const J = { hip: [8.5, 34, -1], knee: [9, 18, 2], shoulder: [15, 58, 3], neck: [0, 67, 5], tail: [0, 33, -10], garuda: [0, 56, -14] };

// ======================= Rodan (Boss) =======================
const RO = { hp: 100, alt: 80, range: [160, 220], diveEvery: 9, diveDmg: 5, beamEvery: 4, beamDur: 1.6, beamDps: 4,
  dmg: { beam: 5, claw: 6, tail: 8, pulse: 9 } };

export class Rodan {
  constructor(units, scene, fx, events, military, models) {
    this.scene = scene; this.fx = fx; this.events = events; this.military = military;
    this.moth = new Moth(models.kaiju93, scene, 'RO', 1.25, RO_WING);
    this.group = this.moth.group;
    this.mesh = this.group;
    this.beam = makeBeam(scene, [1.9, 0.7, 0.15], [2.4, 1.8, 0.9]);
    this.bodyTarget = { mesh: { position: new THREE.Vector3() }, hp: 1 };
    this.mats = [];
    this.group.traverse(o => { if (o.isMesh && /RO_Skin|RO_Membrane/.test(o.material.name)) { o.material = o.material.clone(); this.mats.push(o.material); } });
    this.active = false; this.dead = false; this.hp = 100;
  }

  get label() { return this.fire ? 'FIRE RODAN' : 'RODAN'; }

  start(gz) {
    this.active = true; this.dead = false; this.fire = false; this.hp = 100;
    this.state = 'fly'; this.st = 0; this.diveT = 6; this.beamT = 5;
    this.group.position.set(gz.x + 300, 160, gz.z - 600);
    this.group.visible = true;
    this.events.emit('bossStart', {});
    this.events.emit('rodanRoar', {});
  }

  fighting() { return this.active && !this.dead && (this.state === 'fly' || this.state === 'dive'); }
  targets() { return this.fighting() ? [this.bodyTarget] : []; }
  rayHit(o, d, max) { return this.active && !this.dead && this.state !== 'down' ? sphereHit(this.bodyTarget.mesh.position, 20, o, d, max) : max; }
  stun(t) { if (this.fighting()) { this.stunT = t; this.beam.t = 0; if (this.state === 'dive') this.state = 'fly'; } }

  update(dt, g, city) {
    this.city = city;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    const o = this.group, gp = g.position, p = o.position;
    // Fire Rodan glüht
    const glow = this.fire ? 0.5 + 0.3 * Math.sin(this.st * 6) : 0;
    for (const m of this.mats) m.emissive.setRGB(glow, glow * 0.35, glow * 0.05);
    if (this.fire && Math.random() < dt * 8) this.fx.fire.emit(p.x, p.y, p.z, 1, { spread: 10, up: 3, out: 3, size: 12, life: 0.7 });
    if (this.state === 'down') {                                 // abgestürzt, erhebt sich als Fire Rodan
      p.y = Math.max(0, p.y - 60 * dt);
      o.rotation.z = 0.6;
      this.moth.flap(dt, 1, 0.1, -0.3);
      if (Math.random() < dt * 6) this.fx.dust.emit(p.x, 2, p.z, 1, { spread: 8, up: 6, out: 2, size: 20, life: 3, color: [0.15, 0.12, 0.1] });
      if (this.st > 5) {
        this.fire = true; this.state = 'fly'; this.st = 0; this.hp = 100; o.rotation.z = 0;
        this.events.emit('rodanFire', { title: 'FIRE RODAN' });
        this.events.emit('rodanRoar', {});
      }
      return;
    }
    if (this.dead) return this.crash(dt, g, city);
    let alt = RO.alt + 8 * Math.sin(this.st * 0.9), want = (RO.range[0] + RO.range[1]) / 2;
    if (this.state === 'fly' && !this.stunT) {
      if ((this.diveT -= dt) <= 0) { this.state = 'dive'; this.st = 0; this.hit = false; this.events.emit('rodanRoar', {}); }
      if (this.fire && (this.beamT -= dt) <= 0) { this.beamT = RO.beamEvery * (0.8 + 0.4 * Math.random()); this.beam.t = RO.beamDur; this.events.emit('prismBeam', {}); }
    }
    if (this.state === 'dive') {                                 // Sturzflug, Überschallknall über Godzilla
      alt = Math.max(35, clearAlt(city, gp.x, gp.z, 70) + 10); want = 0;
      if (!this.hit && Math.hypot(p.x - gp.x, p.z - gp.z) < 40) {
        this.hit = true;
        g.takeDamage(RO.diveDmg * (this.fire ? 1.3 : 1), gp);
        if (city) city.damage(new THREE.Vector3(p.x, 0, p.z), 60, 140, p.clone(), true, 30);
        this.events.emit('shake', 1.4);
        this.fx.dust.emit(p.x, 3, p.z, 16, { spread: 30, up: 4, out: 26, size: 26, life: 2.5 });
      }
      if (this.st > 3.5 || (this.hit && this.st > 1.6)) { this.state = 'fly'; this.diveT = RO.diveEvery * (0.8 + 0.4 * Math.random()); }
    }
    orbit(o, dt, gp, alt, want, this.state === 'dive' ? 85 : 38, this.state === 'dive' ? 0 : 0.08, this.state === 'dive' ? null : city);
    faceTo(o, gp, dt, 1.6, this.state === 'dive' ? 0.3 : 0.08);
    this.moth.flap(dt, this.state === 'dive' ? 1.5 : 3.6, this.state === 'dive' ? 0.1 : 0.5);
    this.bodyTarget.mesh.position.copy(p);
    if (this.beam.t > 0 && !this.stunT) { this.beam.t -= dt; fireBeam(this.beam, dt, o.localToWorld(_c.set(0, 9, 44)), g, city, RO.beamDps, this.fx); }
    else this.beam.update(dt, false);
  }

  crash(dt, g, city) {
    const o = this.group, p = o.position;
    this.vy = (this.vy || 0) - 18 * dt;
    p.y = Math.max(0, p.y + this.vy * dt);
    o.rotation.z += dt;
    this.fx.fire.emit(p.x, p.y, p.z, 2, { spread: 10, up: 4, out: 4, size: 16, life: 0.8 });
    if (p.y <= 0.5 && this.active) {
      this.military.boom(p, 2);
      if (city) city.damage(p.clone(), 50, 300, p.clone(), true, 20);
      this.events.emit('shake', 2);
      o.visible = false; this.active = false;
      this.beam.update(0, false);
      // Rodans Lebensenergie geht auf Godzilla über
      g.heal(40); g.energy = 100; g.power = 1.5;
      this.events.emit('rodanGift', {});
      this.events.emit('bossCrash', { pos: p.clone() });
    }
  }

  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const c = this.bodyTarget.mesh.position;
    if (e.kind === 'pulse') { if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 150 && c.y < 100) this.damage(RO.dmg.pulse, true); return; }
    if (this.state !== 'dive') return;                            // nur im Sturzflug erreichbar
    if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < e.radius + 22) this.damage(e.kind === 'tail' ? RO.dmg.tail * Math.min(1, e.damage / 100) : RO.dmg.claw, true);
  }

  beamLine(from, to, dt) { if (this.fighting() && to.distanceTo(this.bodyTarget.mesh.position) < 28) this.damage(RO.dmg.beam * dt); }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.bodyTarget.mesh.position, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    this.beam.t = 0;
    if (!this.fire) { this.state = 'down'; this.st = 0; this.events.emit('rodanRoar', {}); }
    else { this.dead = true; this.vy = 0; this.events.emit('bossDown', {}); this.events.emit('rodanRoar', {}); }
  }
}

// ======================= Mechagodzilla (Endgegner) =======================
const MG = { hp: 100, speed: 7, laserEvery: 4.5, laserDur: 1.4, laserDps: 3, busterEvery: 11, busterDur: 2, busterDps: 5,
  anchorEvery: 18, anchorDps: 2.4, anchorMax: 8, absorbFull: 2.5, plasmaDur: 2.2, plasmaDps: 7,
  dmg: { beam: 3, claw: 4, tail: 6, pulse: 7, back: 2.5, front: 0.3, free: 8 } };

export class Mechagodzilla {
  constructor(gltf, scene, fx, events, glow, military) {
    this.scene = scene; this.fx = fx; this.events = events; this.military = military;
    const get = n => { const o = gltf.scene.getObjectByName(n).clone(); o.position.set(0, 0, 0); return o; };
    const pivot = (j, sx = 1) => { const g = new THREE.Group(); g.position.set(sx * j[0], j[1], j[2]); return g; };
    this.group = new THREE.Group();
    this.group.scale.setScalar(1.15);
    this.group.visible = false;
    scene.add(this.group);
    this.group.add(get('MG_torso'));
    this.neck = pivot(J.neck); this.neck.add(get('MG_head')); this.group.add(this.neck);
    this.arms = [1, -1].map(sx => { const p = pivot(J.shoulder, sx), a = get('MG_arm'); a.scale.x = sx; p.add(a); this.group.add(p); return p; });
    this.legs = [1, -1].map(sx => {
      const hip = pivot(J.hip, sx), th = get('MG_thigh'); th.scale.x = sx; hip.add(th);
      const knee = new THREE.Group(); knee.position.set(0, J.knee[1] - J.hip[1], J.knee[2] - J.hip[2]);
      const sh = get('MG_shin'); sh.scale.x = sx; knee.add(sh); hip.add(knee);
      this.group.add(hip);
      return { hip, knee };
    });
    this.garuda = get('MG_garuda');
    this.garuda.visible = false;
    scene.add(this.garuda);
    this.garuda.scale.setScalar(1.15);
    let metal = null;
    this.group.traverse(o => { if (o.isMesh && !metal && /MG_Metal/.test(o.material.name)) metal = o.material; });
    this.tail = new Chain(scene, metal, 60, 5, 1.5, { color: [0.45, 0.48, 0.54], rings: 16 });
    this.tail.visible = false;
    this.laser = makeBeam(scene, [1.8, 1.5, 0.3], [2.4, 2.2, 1.2]);
    this.buster = makeBeam(scene, [0.4, 0.8, 1.9], [1.6, 2.0, 2.4]);
    this.plasma = makeBeam(scene, [1.9, 0.5, 0.9], [2.4, 1.6, 2.0]);
    this.cannons = [makeBeam(scene, [0.4, 0.8, 1.9], [1.6, 2.0, 2.4]), makeBeam(scene, [0.4, 0.8, 1.9], [1.6, 2.0, 2.4])];
    const cmat = new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.9, roughness: 0.3 });
    this.cables = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2), cmat);
      m.visible = false; m.frustumCulled = false; scene.add(m);
      return m;
    });
    this.center = new THREE.Vector3();
    this.bodyTarget = { mesh: { position: this.center }, hp: 1 };
    this.active = false; this.dead = false; this.hp = MG.hp;
  }

  get label() { return this.super ? 'SUPER-MECHAGODZILLA' : 'MECHAGODZILLA'; }

  start(gz, city) {
    this.city = city;
    this.active = true; this.dead = false; this.hp = MG.hp; this.super = false;
    this.state = 'walk'; this.st = 0; this.walkPh = 0;
    this.group.position.set(gz.x + 120, 0, gz.z - 380);
    this.group.visible = true; this.tail.visible = true;
    this.laserT = 3; this.busterT = 8; this.anchorT = 10; this.absorb = 0;
    this.events.emit('finalRise', { title: 'MECHAGODZILLA' });
    this.events.emit('mgRoar', {});
  }

  fighting() { return this.active && !this.dead && this.state !== 'dock'; }
  targets() { return this.fighting() ? [this.bodyTarget] : []; }
  rayHit(o, d, max) { return this.active && !this.dead ? sphereHit(this.center, 24, o, d, max) : max; }

  stun(t) {
    if (!this.fighting()) return;
    this.stunT = t; this.laser.t = this.buster.t = this.plasma.t = 0;
  }

  update(dt, g) {
    this.g = g;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    const G = this.group, p = G.position, gp = g.position, city = this.city;
    if (this.dead) return this.fall(dt);
    const dist = Math.hypot(gp.x - p.x, gp.z - p.z);
    faceTo(G, gp, dt, 0.5);
    // Gehen: schwerfällig, Beine schwingen, Gebäude werden zermalmt
    const moving = dist > 110 && !this.hold && !this.stunT && this.state === 'walk';
    if (moving) {
      p.x += Math.sin(G.rotation.y) * MG.speed * dt; p.z += Math.cos(G.rotation.y) * MG.speed * dt;
      this.walkPh += dt * 2.2;
      if (city) city.crush(p.clone().add(new THREE.Vector3(Math.sin(G.rotation.y) * 12, 0, Math.cos(G.rotation.y) * 12)), 20, dt);
      if (Math.abs(Math.sin(this.walkPh)) < 0.05 && !this.stepped) { this.stepped = true; this.events.emit('shake', 0.4); }
      if (Math.abs(Math.sin(this.walkPh)) > 0.3) this.stepped = false;
    }
    const sw = moving ? Math.sin(this.walkPh) : 0;
    this.legs.forEach((l, i) => { const s = i ? -sw : sw; l.hip.rotation.x = s * 0.35; l.knee.rotation.x = Math.max(0, -s) * 0.5; });
    this.arms.forEach((a, i) => { a.rotation.x = (i ? sw : -sw) * 0.2 - (this.hold ? 0.9 : 0); });
    this.neck.rotation.x = this.buster.t > 0 ? 0.15 : -0.05;
    p.y = Math.abs(sw) * 0.6;
    G.updateMatrixWorld(true);
    this.center.copy(p).setY(p.y + 50);
    // Schwanz schleift hinter ihm
    const root = _a.set(...J.tail).applyMatrix4(G.matrixWorld).clone();
    const back = new THREE.Vector3(-Math.sin(G.rotation.y), 0, -Math.cos(G.rotation.y));
    const tip = root.clone().addScaledVector(back, 55).setY(3).add(new THREE.Vector3(Math.cos(G.rotation.y), 0, -Math.sin(G.rotation.y)).multiplyScalar(Math.sin(this.st * 0.8) * 12));
    this.tail.pose(root, root.clone().addScaledVector(back, 18).setY(root.y - 10), tip.clone().addScaledVector(back, -18).setY(6), tip, tip.clone().sub(root));
    // Garuda: bei halber Kraft fliegt er heran und dockt an
    if (!this.super && this.hp <= 50 && this.state === 'walk') { this.state = 'dock'; this.st = 0; this.garuda.visible = true;
      this.garuda.position.copy(p).add(new THREE.Vector3(0, 200, -500)); this.events.emit('garuda', { title: 'GARUDA DOCKT AN' }); }
    if (this.state === 'dock') {
      const at = _b.set(...J.garuda).multiplyScalar(1).applyMatrix4(G.matrixWorld);
      this.garuda.position.lerp(at, Math.min(1, dt * 1.2));
      this.garuda.rotation.copy(G.rotation);
      if (this.garuda.position.distanceTo(at) < 3 || this.st > 6) { this.super = true; this.state = 'walk'; this.events.emit('finalRise', { title: 'SUPER-MECHAGODZILLA' }); }
    } else if (this.super) {
      this.garuda.position.copy(_b.set(...J.garuda).applyMatrix4(G.matrixWorld));
      this.garuda.rotation.copy(G.rotation);
    }
    this.attacks(dt, g, dist);
    this.updateAnchors(dt, g);
    // Godzilla kann nicht durch ihn hindurch
    if (dist < 40 && dist > 0.01) { gp.x = p.x + (gp.x - p.x) / dist * 40; gp.z = p.z + (gp.z - p.z) / dist * 40; }
  }

  attacks(dt, g, dist) {
    const city = this.city, G = this.group;
    if (!this.stunT && !this.hold && this.state === 'walk') {
      if ((this.laserT -= dt) <= 0) { this.laserT = MG.laserEvery * (0.8 + 0.4 * Math.random()); this.laser.t = MG.laserDur; this.events.emit('prismBeam', {}); }
      if ((this.busterT -= dt) <= 0) { this.busterT = MG.busterEvery * (0.8 + 0.4 * Math.random()); this.buster.t = MG.busterDur; this.events.emit('megaBuster', {}); }
      if ((this.anchorT -= dt) <= 0 && dist < 260) { this.anchorT = MG.anchorEvery; this.hold = { t: 0 }; g.held = 'vines'; this.events.emit('grabStart', { kind: 'anchors' }); }
      if (this.super && this.laser.t > 0) for (const c of this.cannons) c.t = Math.max(c.t, 0.05);
    }
    const fire = (b, local, dps) => { if (b.t > 0 && !this.stunT) { b.t -= dt; fireBeam(b, dt, G.localToWorld(_c.set(...local)), g, city, dps, this.fx); } else b.update(dt, false); };
    fire(this.laser, [0, 72, 11], MG.laserDps);
    fire(this.buster, [0, 70, 17], MG.busterDps);
    fire(this.plasma, [0, 50, 12], MG.plasmaDps);
    this.cannons.forEach((c, i) => fire(c, [i ? -5 : 5, 60, 10], MG.laserDps * 0.6));
  }

  updateAnchors(dt, g) {
    const on = !!this.hold && this.fighting();
    this.cables.forEach((c, i) => {
      c.visible = on;
      if (!on) return;
      const from = this.arms[i].localToWorld(_a.set(i ? -1.5 : 1.5, -15, 14));
      const to = _b.copy(g.position).add(new THREE.Vector3(i ? -9 : 9, 52, 0).applyAxisAngle(UP, g.heading));
      c.position.copy(from); c.lookAt(to); c.scale.set(1, 1, from.distanceTo(to));
    });
    if (!this.hold) return;
    this.hold.t += dt;
    g.speedCap = 0;
    g.takeDamage(MG.anchorDps * dt, g.position);
    g.hurt = 0;
    if (this.hold.t > MG.anchorMax) this.release(g, 'timeout');
  }

  release(g, how) {
    if (!this.hold) return;
    this.hold = null;
    if (g) { g.held = null; g.speedCap = Infinity; }
    this.events.emit('holdFree', { kind: 'grab', how });
    if (how === 'pulse') { this.damage(MG.dmg.free, true); this.military.boom(this.center, 1); }
  }

  // Von hinten getroffen? (Winkel zwischen Blickrichtung und Richtung zum Angreifer)
  fromBehind(from) {
    const G = this.group, dx = from.x - G.position.x, dz = from.z - G.position.z;
    return (Math.sin(G.rotation.y) * dx + Math.cos(G.rotation.y) * dz) / Math.max(1, Math.hypot(dx, dz)) < -0.35;
  }

  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const c = this.center, D = MG.dmg;
    if (e.kind === 'pulse') {
      if (this.hold) this.release(this.g, 'pulse');
      if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 150) this.damage(D.pulse * (this.fromBehind(e.from) ? D.back : 1), true);
      return;
    }
    if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < e.radius + 26) {
      const back = this.fromBehind(e.from);
      this.damage((e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw) * (back ? D.back : 1), true);
      if (back) this.events.emit('secondBrain', {});
    }
  }

  // Atomstrahl: von vorn saugt die Plasmagranate ihn auf (wenig Schaden, lädt den Rückschuss), von hinten trifft er
  // das zweite Gehirn
  beamLine(from, to, dps, dt) {
    if (!this.fighting() || to.distanceTo(this.center) > 32) return;
    const D = MG.dmg;
    if (this.fromBehind(from)) { this.damage(D.beam * D.back * dt); if (Math.random() < dt * 2) this.events.emit('secondBrain', {}); return; }
    this.damage(D.beam * D.front * dt);
    this.absorb += dt;
    if (Math.random() < dt * 12) this.fx.fire.emit(to.x, to.y, to.z, 1, { spread: 3, up: 2, out: 6, size: 9, life: 0.4 });
    if (this.absorb > MG.absorbFull) { this.absorb = 0; this.plasma.t = MG.plasmaDur; this.events.emit('plasmaGrenade', {}); }
  }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.center, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    this.dead = true; this.st = 0;
    if (this.hold) this.release(this.g, 'timeout');
    for (const b of [this.laser, this.buster, this.plasma, ...this.cannons]) b.t = 0;
    this.events.emit('finalDown', { title: 'MECHAGODZILLA IST ZERSTÖRT' });
  }

  // kippt nach hinten, Explosionen, dann weg
  fall(dt) {
    const G = this.group;
    G.rotation.x = Math.max(-1.45, G.rotation.x - dt * 0.5);
    for (const b of [this.laser, this.buster, this.plasma, ...this.cannons]) b.update(dt, false);
    if (Math.random() < dt * 5) this.military.boom(this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30)), 1.1);
    if (this.st > 4 && this.active) {
      this.military.boom(G.position, 3);
      this.events.emit('shake', 2.4);
      G.visible = false; this.tail.visible = false; this.garuda.visible = false; this.active = false;
      this.events.emit('finalGone', {});
    }
  }
}
