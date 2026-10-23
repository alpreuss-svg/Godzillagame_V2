// 1995 (Finale): Destoroyah. Modelle aus kaiju95.glb.
// Boss in zwei Stufen: ein Schwarm Jungtiere kriecht aus der Bucht (krabbenartig, springen Godzilla an, spucken Mikro-
// Sauerstoff); sind alle tot, verschmelzen die Reste zur Flugform (fliegt, Mikro-Sauerstoff-Strahl, Sturzflug).
// Endgegner: Destoroyah in Endform – riesiger roter Dämon, Mikro-Sauerstoff-Strahl aus dem Maul, Laserhorn im Nahkampf,
// Schwanzschere packt Godzilla und saugt ihm den Sauerstoff aus (nur der Kernpuls befreit), Flugsprünge.
import * as THREE from 'three';
import { Chain } from './chain.js';
import { Moth, makeBeam, fireBeam, orbit, faceTo, sphereHit, clearAlt, UP } from './kaiju.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const FLY_WING = [5, 4, -3];                 // blender/kaiju95.py WING_FLY (glTF x, z, -y)
const FINAL_WING = [14, 66, -6];             // WING_FINAL
const OXY = [[1.9, 0.25, 0.9], [2.4, 1.3, 2.0]];   // Mikro-Sauerstoff: purpur
// Haut und Flughäute nachts aufhellen (die Vertexfarben sind dunkelrot)
const brighten = gltf => gltf.scene.traverse(o => { if (o.isMesh && /DE_Skin|DE_Membrane/.test(o.material.name)) o.material.color.setScalar(2.2); });

// ======================= Destoroyah: Jungtiere und Flugform (Boss) =======================
const DS = { n: 6, juvHp: 30, juvSpeed: 18, leapDmg: 2, leapRate: 0.07, spitEvery: 8, spitDps: 1.2,
  fly: { hp: 100, alt: 75, range: [150, 210], beamEvery: 3.5, beamDur: 1.8, beamDps: 3, diveEvery: 10, diveDmg: 6 },
  dmg: { beam: 4.5, claw: 5, tail: 7, pulse: 8 } };

export class DestoroyahSwarm {
  constructor(units, scene, fx, events, military, models) {
    const gltf = models.kaiju95;
    brighten(gltf);
    this.scene = scene; this.fx = fx; this.events = events; this.military = military;
    this.juvs = [];
    for (let i = 0; i < DS.n; i++) {
      const m = gltf.scene.getObjectByName('DE_juvenile').clone();
      m.scale.setScalar(1.15); m.visible = false; scene.add(m);
      const spit = makeBeam(scene, ...OXY);
      spit.layers[0].userData.r = 1.6; spit.layers[1].userData.r = 0.6;
      this.juvs.push({ mesh: m, hp: DS.juvHp, alive: false, spit, spitT: 2 + i, ph: Math.random() * 6, leap: null });
    }
    this.moth = new Moth(gltf, scene, 'DEF', 1.2, FLY_WING);
    this.moth.group.visible = false;
    this.beam = makeBeam(scene, ...OXY);
    this.center = new THREE.Vector3();
    this.mesh = { position: this.center };
    this.bodyTarget = { mesh: { position: this.center }, hp: 1 };
    this.active = false; this.dead = false; this.hp = 100;
  }

  get label() { return this.form === 'fly' ? 'DESTOROYAH – FLUGFORM' : 'DESTOROYAH – JUNGTIERE'; }

  start(gz) {
    this.active = true; this.dead = false; this.form = 'swarm'; this.state = 'swarm'; this.st = 0; this.hp = 100;
    this.juvs.forEach((j, i) => {
      const a = (i / DS.n - 0.5) * 1.6;
      j.mesh.position.set(gz.x + Math.sin(a) * 220, -8, (this.city ? this.city.bayZ : gz.z + 300) + 40 + Math.random() * 40);
      j.mesh.visible = true; j.alive = true; j.hp = DS.juvHp;
    });
    this.events.emit('bossStart', {});
    this.events.emit('desRoar', {});
  }

  fighting() { return this.active && !this.dead && (this.state === 'swarm' || this.state === 'fly' || this.state === 'dive'); }
  targets() {
    if (!this.fighting()) return [];
    return this.form === 'swarm' ? this.juvs.filter(j => j.alive) : [this.bodyTarget];
  }
  rayHit(o, d, max) {
    if (!this.active || this.dead) return max;
    if (this.form === 'swarm') { let m = max; for (const j of this.juvs) if (j.alive) m = sphereHit(_a.copy(j.mesh.position).setY(j.mesh.position.y + 8), 11, o, d, m); return m; }
    return this.state === 'merge' ? max : sphereHit(this.center, 20, o, d, max);
  }
  stun(t) { if (this.fighting()) { this.stunT = t; this.beam.t = 0; for (const j of this.juvs) j.spit.t = 0; if (this.state === 'dive') this.state = 'fly'; } }

  update(dt, g, city) {
    this.city = city;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    if (this.form !== 'fly') this.updateSwarm(dt, g, city);
    else this.updateFly(dt, g, city);
  }

  updateSwarm(dt, g, city) {
    const gp = g.position;
    let alive = 0, hpSum = 0;
    for (const j of this.juvs) {
      if (!j.alive) { j.spit.update(dt, false); continue; }
      alive++; hpSum += j.hp;
      const p = j.mesh.position;
      j.ph += dt;
      const dx = gp.x - p.x, dz = gp.z - p.z, d = Math.hypot(dx, dz);
      if (j.leap) {                                           // Sprung auf Godzilla
        j.leap.t += dt;
        const k = Math.min(1, j.leap.t / 0.9);
        p.lerpVectors(j.leap.from, _a.copy(gp).setY(gp.y + 30), k);
        p.y += Math.sin(Math.PI * k) * 30;
        if (k >= 1) { g.takeDamage(DS.leapDmg, gp); this.events.emit('shake', 0.6); p.copy(gp).addScaledVector(j.leap.back, 55).setY(0); j.leap = null; }
      } else if (!this.stunT) {
        // krabbelt zickzack heran, umkreist Godzilla in 60–90 m
        const side = Math.sin(j.ph * 1.7) * 0.9, want = 70;
        const nx = dx / Math.max(d, 1), nz = dz / Math.max(d, 1);
        const fw = d > want ? 1 : d < want - 20 ? -0.6 : 0;
        p.x += (nx * fw - nz * side) * DS.juvSpeed * dt;
        p.z += (nz * fw + nx * side) * DS.juvSpeed * dt;
        p.y = Math.min(0, p.y + 4 * dt);
        if (d < 34) { p.x = gp.x - nx * 34; p.z = gp.z - nz * 34; }         // nicht in Godzilla hinein
        if (city) city.crush(p.clone(), 10, dt);
        if (d < 110 && Math.random() < dt * DS.leapRate) j.leap = { from: p.clone(), t: 0, back: new THREE.Vector3(-dx, 0, -dz).normalize() };
        if ((j.spitT -= dt) <= 0 && d < 220) { j.spitT = DS.spitEvery * (0.8 + 0.4 * Math.random()); j.spit.t = 1.2; this.events.emit('prismBeam', {}); }
      }
      j.mesh.rotation.y = Math.atan2(dx, dz);
      if (j.spit.t > 0 && !this.stunT) { j.spit.t -= dt; fireBeam(j.spit, dt, j.mesh.localToWorld(_c.set(0, 9, 14)), g, city, DS.spitDps, this.fx); }
      else j.spit.update(dt, false);
    }
    this.hp = Math.round(hpSum / (DS.n * DS.juvHp) * 100);
    const c = this.juvs.find(j => j.alive);
    if (c) this.center.copy(c.mesh.position);
    if (alive === 0 && this.state === 'swarm') { this.state = 'merge'; this.form = 'merge'; this.st = 0; this.mergeAt = gp.clone().add(new THREE.Vector3(0, 0, 200)); this.events.emit('desMerge', { title: 'DIE JUNGTIERE VERSCHMELZEN' }); }
    if (this.state === 'merge') {                             // rötlicher Nebel ballt sich, die Flugform steigt auf
      const m = this.mergeAt;
      for (let k = 0; k < 4; k++) this.fx.dust.emit(m.x + (Math.random() - 0.5) * 120, 2, m.z + (Math.random() - 0.5) * 120, 1, { spread: 4, up: 12, out: -6, size: 22, life: 2, color: [0.5, 0.1, 0.12] });
      if (this.st > 3.5) {
        this.form = 'fly'; this.state = 'fly'; this.st = 0; this.hp = 100;
        const o = this.moth.group; o.position.set(m.x, 5, m.z); o.visible = true;
        this.beamT = 4; this.diveT = 8;
        this.events.emit('desChange', { title: 'DESTOROYAH – FLUGFORM' });
        this.events.emit('desRoar', {});
      }
    }
  }

  updateFly(dt, g, city) {
    const K = DS.fly, o = this.moth.group, gp = g.position;
    if (this.dead) return this.crash(dt, city);
    let alt = K.alt + 6 * Math.sin(this.st * 0.8), want = (K.range[0] + K.range[1]) / 2;
    if (this.state === 'fly' && !this.stunT) {
      if ((this.beamT -= dt) <= 0) { this.beamT = K.beamEvery * (0.8 + 0.4 * Math.random()); this.beam.t = K.beamDur; this.events.emit('prismBeam', {}); }
      if ((this.diveT -= dt) <= 0) { this.state = 'dive'; this.st = 0; this.hit = false; this.events.emit('desRoar', {}); }
    }
    if (this.state === 'dive') {
      alt = Math.max(40, clearAlt(city, gp.x, gp.z, 70) + 10); want = 5;
      if (!this.hit && Math.hypot(o.position.x - gp.x, o.position.z - gp.z) < 35) { this.hit = true; g.takeDamage(K.diveDmg, gp); this.events.emit('shake', 1.3); }
      if (this.st > 3.5 || (this.hit && this.st > 1.2)) { this.state = 'fly'; this.diveT = K.diveEvery * (0.8 + 0.4 * Math.random()); }
    }
    orbit(o, dt, gp, alt, want, this.state === 'dive' ? 75 : 36, this.state === 'dive' ? 0 : 0.07, this.state === 'dive' ? null : city);
    faceTo(o, gp, dt, 1.5, this.state === 'dive' ? 0.3 : 0.08);
    this.moth.flap(dt, this.state === 'dive' ? 1.5 : 3.8, this.state === 'dive' ? 0.15 : 0.55);
    this.center.copy(o.position);
    if (this.beam.t > 0 && !this.stunT) { this.beam.t -= dt; fireBeam(this.beam, dt, o.localToWorld(_c.set(0, 6, 30)), g, city, K.beamDps, this.fx); }
    else this.beam.update(dt, false);
  }

  crash(dt, city) {
    const o = this.moth.group, p = o.position;
    this.vy = (this.vy || 0) - 18 * dt;
    p.y = Math.max(0, p.y + this.vy * dt);
    o.rotation.z += dt;
    this.fx.fire.emit(p.x, p.y, p.z, 2, { spread: 10, up: 4, out: 4, size: 16, life: 0.8 });
    if (p.y <= 0.5 && this.active) {
      this.military.boom(p, 2.2);
      if (city) city.damage(p.clone(), 50, 300, p.clone(), true, 20);
      this.events.emit('shake', 2);
      o.visible = false; this.active = false; this.beam.update(0, false);
      this.events.emit('bossCrash', { pos: p.clone() });
    }
  }

  // ---------- Schaden ----------
  hitJuvs(test, amount) {
    for (const j of this.juvs) {
      if (!j.alive || !test(j)) continue;
      j.hp -= amount;
      if (j.hp <= 0) {
        j.alive = false; j.mesh.visible = false; j.spit.t = 0;
        this.military.boom(j.mesh.position.clone().setY(6), 0.9);
        this.fx.dust.emit(j.mesh.position.x, 4, j.mesh.position.z, 6, { spread: 8, up: 5, out: 6, size: 14, life: 2, color: [0.45, 0.1, 0.12] });
        this.events.emit('bossHit', {});
      }
    }
  }

  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const D = DS.dmg;
    if (this.form === 'swarm') {
      const r = e.kind === 'pulse' ? 150 : e.radius + 14;
      this.hitJuvs(j => Math.hypot(e.pos.x - j.mesh.position.x, e.pos.z - j.mesh.position.z) < r, e.kind === 'pulse' ? 14 : e.damage * 0.25);
      return;
    }
    const c = this.center;
    if (e.kind === 'pulse') { if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 150 && c.y < 100) this.damage(D.pulse, true); return; }
    if (this.state !== 'dive') return;
    if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < e.radius + 22) this.damage(e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw, true);
  }

  beamLine(from, to, dt) {
    if (!this.fighting()) return;
    if (this.form === 'swarm') { this.hitJuvs(j => to.distanceTo(_a.copy(j.mesh.position).setY(j.mesh.position.y + 8)) < 16, 10 * dt); return; }
    if (to.distanceTo(this.center) < 28) this.damage(DS.dmg.beam * dt);
  }

  damage(n, big) {
    if (!this.fighting() || this.form !== 'fly') return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.center, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    this.dead = true; this.vy = 0; this.beam.t = 0;
    this.events.emit('bossDown', {}); this.events.emit('desRoar', {});
  }
}

// ======================= Destoroyah Endform (Endgegner) =======================
const DF = { hp: 100, speed: 9, oxyEvery: 5, oxyDur: 2, oxyDps: 5, hornEvery: 7, hornDur: 1.3, hornDps: 6,
  grabEvery: 16, grabDps: 2.8, grabMax: 8, hopEvery: 22,
  dmg: { beam: 3.5, claw: 4, tail: 6, pulse: 7, free: 8 } };

export class Destoroyah {
  constructor(gltf, scene, fx, events, glow, military) {
    this.scene = scene; this.fx = fx; this.events = events; this.glow = glow; this.military = military;
    brighten(gltf);
    const get = n => { const o = gltf.scene.getObjectByName(n).clone(); o.position.set(0, 0, 0); return o; };
    this.group = new THREE.Group();
    this.group.scale.setScalar(1.15);
    this.group.visible = false;
    scene.add(this.group);
    this.group.add(get('DE_body'));
    this.wings = [1, -1].map(sx => {
      const p = new THREE.Group(); p.position.set(sx * FINAL_WING[0], FINAL_WING[1], FINAL_WING[2]);
      const w = get('DE_wing'); w.scale.x = sx; w.traverse(o => { if (o.isMesh) o.material.side = THREE.DoubleSide; });
      p.add(w); this.group.add(p); p.userData.sx = sx; return p;
    });
    let skin = null;
    this.group.traverse(o => { if (o.isMesh && !skin && /DE_Skin/.test(o.material.name)) skin = o.material; });
    this.tail = new Chain(scene, skin, 105, 7, 2.2, { color: [0.5, 0.08, 0.07], rings: 18, head: get('DE_pincer') });
    this.tail.visible = false;
    this.oxy = makeBeam(scene, ...OXY);
    this.horn = makeBeam(scene, [1.9, 0.5, 0.3], [2.4, 1.6, 1.2]);
    this.center = new THREE.Vector3();
    this.bodyTarget = { mesh: { position: this.center }, hp: 1 };
    this.active = false; this.dead = false; this.hp = DF.hp;
  }

  get label() { return 'DESTOROYAH'; }

  start(gz, city) {
    this.city = city;
    this.active = true; this.dead = false; this.hp = DF.hp;
    this.state = 'land'; this.st = 0;
    this.group.position.set(gz.x - 120, 220, gz.z - 260);
    this.group.visible = true; this.tail.visible = true;
    this.oxyT = 4; this.hornT = 6; this.grabT = 12; this.hopT = DF.hopEvery;
    this.events.emit('finalRise', { title: 'DESTOROYAH' });
    this.events.emit('desRoar', {});
  }

  fighting() { return this.active && !this.dead && (this.state === 'walk' || this.state === 'hop'); }
  targets() { return this.fighting() ? [this.bodyTarget] : []; }
  rayHit(o, d, max) { return this.active && !this.dead ? sphereHit(this.center, 26, o, d, max) : max; }
  stun(t) { if (this.fighting()) { this.stunT = t; this.oxy.t = this.horn.t = 0; } }

  update(dt, g) {
    this.g = g;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    const G = this.group, p = G.position, gp = g.position, city = this.city;
    if (this.dead) return this.fall(dt);
    const dist = Math.hypot(gp.x - p.x, gp.z - p.z);
    let wingUp = 0.5;
    if (this.state === 'land') {                                  // landet mit ausgebreiteten Flügeln
      p.y = Math.max(0, p.y - 60 * dt); wingUp = 0.1 + 0.3 * Math.sin(this.st * 5);
      if (p.y <= 0) { this.state = 'walk'; this.st = 0; this.events.emit('shake', 1.6); this.fx.dust.emit(p.x, 0, p.z, 24, { spread: 50, up: 5, out: 18, size: 28, life: 4 }); this.events.emit('desRoar', {}); }
    } else if (this.state === 'walk') {
      faceTo(G, gp, dt, 0.6);
      const move = dist > 85 && !this.hold && !this.stunT;
      if (move) { p.x += Math.sin(G.rotation.y) * DF.speed * dt; p.z += Math.cos(G.rotation.y) * DF.speed * dt; if (city) city.crush(p.clone(), 24, dt); }
      p.y = move ? Math.abs(Math.sin(this.st * 2.2)) * 1.2 : 0;
      if (!this.stunT && !this.hold) {
        if ((this.oxyT -= dt) <= 0) { this.oxyT = DF.oxyEvery * (0.8 + 0.4 * Math.random()); this.oxy.t = DF.oxyDur; this.events.emit('prismBeam', {}); }
        if ((this.hornT -= dt) <= 0 && dist < 170) { this.hornT = DF.hornEvery * (0.8 + 0.4 * Math.random()); this.horn.t = DF.hornDur; this.hornSweep = -0.5; this.events.emit('desHorn', {}); }
        if ((this.grabT -= dt) <= 0 && dist < 100) { this.grabT = DF.grabEvery; this.hold = { t: 0 }; g.held = 'vines'; this.events.emit('grabStart', { kind: 'tail' }); }
        if ((this.hopT -= dt) <= 0) { this.state = 'hop'; this.st = 0; this.hopFrom = p.clone(); const a = Math.random() * 6.28;
          this.hopTo = new THREE.Vector3(gp.x + Math.cos(a) * 160, 0, Math.min(city ? city.bayZ - 30 : 1e9, gp.z + Math.sin(a) * 160)); this.events.emit('desRoar', {}); }
      }
    } else if (this.state === 'hop') {                            // Flugsprung auf die andere Seite
      const k = Math.min(1, this.st / 3);
      p.lerpVectors(this.hopFrom, this.hopTo, k); p.y = Math.sin(Math.PI * k) * 70;
      wingUp = 0.2 + 0.5 * Math.sin(this.st * 6);
      faceTo(G, gp, dt, 1.2);
      if (k >= 1) { this.state = 'walk'; this.st = 0; this.hopT = DF.hopEvery * (0.8 + 0.4 * Math.random()); this.events.emit('shake', 1.2);
        if (city) city.damage(p.clone(), 40, 200, p.clone(), true, 15); this.fx.dust.emit(p.x, 0, p.z, 18, { spread: 40, up: 5, out: 16, size: 26, life: 3 }); }
    }
    for (const w of this.wings) w.rotation.set(0, w.userData.sx * -0.3, w.userData.sx * wingUp);
    G.updateMatrixWorld(true);
    this.center.copy(p).setY(p.y + 55);
    this.updateTail(dt, g);
    if (this.oxy.t > 0 && !this.stunT) { this.oxy.t -= dt; fireBeam(this.oxy, dt, G.localToWorld(_c.set(0, 72, 30)), g, city, DF.oxyDps, this.fx); }
    else this.oxy.update(dt, false);
    if (this.horn.t > 0 && !this.stunT) {                         // Laserhorn: schwenkt quer über Godzilla
      this.horn.t -= dt; this.hornSweep += dt * 0.8;
      const from = G.localToWorld(_c.set(0, 92, 40)).clone();
      const dir = _b.copy(gp).setY(gp.y + 50).sub(from).normalize().applyAxisAngle(UP, this.hornSweep);
      const max = city ? city.raycast(from, dir, 260) : 260;
      const end = this.horn.update(dt, true, from, dir, max);
      if (end) {
        if (Math.hypot(end.x - gp.x, end.z - gp.z) < 18) g.takeDamage(DF.hornDps * dt, end);
        else if (city) city.damage(end.clone(), 14, 200 * dt, from, false, end.y);
      }
    } else this.horn.update(dt, false);
    if (dist < 44 && dist > 0.01 && this.state === 'walk') { gp.x = p.x + (gp.x - p.x) / dist * 44; gp.z = p.z + (gp.z - p.z) / dist * 44; }
  }

  // Schwanz: schwingt hinter ihm; beim Griff fasst die Schere Godzilla an der Hüfte
  updateTail(dt, g) {
    const G = this.group, gp = g.position;
    const root = _a.set(0, 28, -16).applyMatrix4(G.matrixWorld).clone();
    const back = new THREE.Vector3(-Math.sin(G.rotation.y), 0, -Math.cos(G.rotation.y)), side = new THREE.Vector3(-back.z, 0, back.x);
    let tip = root.clone().addScaledVector(back, 60).addScaledVector(side, Math.sin(this.st * 0.9) * 22).setY(8);
    let c1 = root.clone().addScaledVector(back, 25).setY(root.y - 8), c2 = tip.clone().addScaledVector(back, -20).setY(18);
    if (this.hold) {
      const at = gp.clone().setY(gp.y + 32);
      tip = tip.lerp(at, Math.min(1, this.hold.t / 0.5));
      c1 = root.clone().addScaledVector(back, 25).setY(root.y + 20); c2 = at.clone().add(new THREE.Vector3(0, 30, 0));
      this.hold.t += dt;
      g.speedCap = 0; g.takeDamage(DF.grabDps * dt, gp); g.hurt = 0;
      if (Math.random() < 0.4) this.glow.emit(at.x, at.y, at.z, 1, { spread: 8, up: 4, out: 3, size: 7, life: 0.8, color: [0.9, 0.3, 0.6] });
      if (this.hold.t > DF.grabMax) this.release(g, 'timeout');
    }
    this.tail.pose(root, c1, c2, tip, tip.clone().sub(c2));
  }

  release(g, how) {
    if (!this.hold) return;
    this.hold = null;
    if (g) { g.held = null; g.speedCap = Infinity; }
    this.events.emit('holdFree', { kind: 'grab', how });
    if (how === 'pulse') this.damage(DF.dmg.free, true);
  }

  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const c = this.center, D = DF.dmg, d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z);
    if (e.kind === 'pulse') { if (this.hold) this.release(this.g, 'pulse'); if (d < 150) this.damage(D.pulse, true); return; }
    if (this.state === 'hop') return;
    if (d < e.radius + 28) this.damage(e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw, true);
  }

  beamLine(from, to, dps, dt) { if (this.fighting() && to.distanceTo(this.center) < 34) this.damage(DF.dmg.beam * dt); }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.center, 0.9); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    this.dead = true; this.st = 0; this.oxy.t = this.horn.t = 0;
    if (this.hold) this.release(this.g, 'timeout');
    this.events.emit('desRoar', {});
    this.events.emit('finalDown', { title: 'DESTOROYAH IST BESIEGT' });
  }

  // steigt brennend auf und zerbirst
  fall(dt) {
    const G = this.group, p = G.position;
    this.oxy.update(dt, false); this.horn.update(dt, false);
    p.y += dt * 25;
    for (const w of this.wings) w.rotation.z = w.userData.sx * (0.3 + 0.6 * Math.sin(this.st * 9));
    this.fx.fire.emit(p.x, p.y + 50, p.z, 3, { spread: 24, up: 4, out: 6, size: 20, life: 1 });
    if (this.st > 4 && this.active) {
      this.military.boom(p.clone().setY(p.y + 50), 3);
      this.events.emit('shake', 2.4);
      G.visible = false; this.tail.visible = false; this.active = false;
      this.events.emit('finalGone', {});
    }
  }
}
