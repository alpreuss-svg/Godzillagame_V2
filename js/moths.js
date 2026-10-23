// 1992: Battra (Boss, zwei Stufen) und Mothra (Endgegnerin). Modelle aus mothra.glb.
// Battra-Larve: dunkler Riesenwurm (Kette aus chain.js mit gepanzertem Kopf), kriecht aus der Bucht, walzt Gebäude
// nieder, rammt Godzilla mit dem Horn und schießt rote Prismenstrahlen aus dem Horn. Besiegt gräbt sie sich ein und
// steigt als Battra-Falter wieder auf: fliegt, schießt rote Strahlen, stürzt sich im Sturzflug auf Godzilla.
// Mothra: großer bunter Falter, gelbe Strahlen aus den Fühlern, Schuppenpulver (goldene Wolke, wirft den Atomstrahl
// zurück und brennt – der Schrei bläst es weg) und Flügelsturm (fliegt tief, drückt Godzilla weg, reißt Gebäude um;
// dann ist sie für Klaue und Schwanz erreichbar).
import * as THREE from 'three';
import { Chain } from './chain.js';
import { Moth, makeBeam, fireBeam, orbit, faceTo, sphereHit, clearAlt, UP } from './kaiju.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// ======================= Battra (Boss) =======================
const LARVA_LEN = 120, LARVA_R = [13, 6];
const BAT = {
  larva: { hp: 100, speed: 9, ramEvery: 9, ramSpeed: 46, ramDmg: 6, beamEvery: 5, beamDur: 1.6, beamDps: 3.5,
    dmg: { beam: 4, claw: 5, tail: 7, pulse: 8 } },
  imago: { hp: 100, alt: 72, range: [150, 210], beamEvery: 3.2, beamDur: 1.6, beamDps: 3.5, diveEvery: 12, diveDmg: 6,
    dmg: { beam: 5, claw: 5, tail: 7, pulse: 8 } },
};

export class Battra {
  constructor(units, scene, fx, events, military, models) {
    const gltf = models.mothra;
    this.scene = scene; this.fx = fx; this.events = events; this.military = military;
    this.center = new THREE.Vector3();
    this.mesh = { position: this.center };                     // Mini-Map, Schrei-Ziel
    // Larve: Kette als Körper (dunkel, geringelt), Kopf aus dem glb
    let skin = null;
    gltf.scene.getObjectByName('BT_head').traverse(o => { if (o.isMesh && !skin) skin = o.material; });
    this.body = new Chain(scene, skin, LARVA_LEN, LARVA_R[0], LARVA_R[1], { color: [0.12, 0.07, 0.05], rings: 24 });
    this.body.visible = false;
    this.head = gltf.scene.getObjectByName('BT_head').clone();
    this.head.visible = false;
    scene.add(this.head);
    this.imago = new Moth(gltf, scene, 'BT', 1.15);
    this.beam = makeBeam(scene, [1.8, 0.2, 0.08], [2.4, 1.0, 0.7]);
    this.beam2 = makeBeam(scene, [1.8, 0.2, 0.08], [2.4, 1.0, 0.7]);
    this.bodyTarget = { mesh: { position: this.center }, hp: 1 };
    this.active = false; this.dead = false; this.hp = 100;
    this.trail = [];
  }

  get label() { return this.form === 'imago' ? 'BATTRA' : 'BATTRA – LARVE'; }

  start(gz) {
    const city = this.city;
    this.active = true; this.dead = false;
    this.form = 'larva'; this.state = 'rise'; this.st = 0; this.hp = 100;
    this.pos = new THREE.Vector3(gz.x + 160, 0, (city ? city.bayZ : 600) + 90);   // aus der Bucht
    this.heading = Math.PI;
    this.trail = [];
    this.body.visible = this.head.visible = true;
    this.ramT = 6; this.beamT = 4;
    this.events.emit('bossStart', {});
    this.events.emit('battraRoar', {});
  }

  fighting() { return this.active && !this.dead && (this.state === 'larva' || this.state === 'imago' || this.state === 'ram' || this.state === 'dive'); }
  targets() { return this.fighting() ? [this.bodyTarget] : []; }
  rayHit(o, d, max) { return this.active && !this.dead ? sphereHit(this.center, this.form === 'larva' ? 18 : 22, o, d, max) : max; }

  stun(t) {
    if (!this.fighting()) return;
    this.stunT = t; this.beam.t = this.beam2.t = 0;
    if (this.state === 'ram') this.state = 'larva';
  }

  update(dt, g, city) {
    this.city = city;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    if (this.form === 'larva') this.updateLarva(dt, g, city);
    else this.updateImago(dt, g, city);
  }

  // ---------- Larve ----------
  updateLarva(dt, g, city) {
    const K = BAT.larva, gp = g.position, p = this.pos;
    const toG = Math.atan2(gp.x - p.x, gp.z - p.z);
    let dh = Math.atan2(Math.sin(toG - this.heading), Math.cos(toG - this.heading));
    let speed = 0;
    if (this.state === 'rise') { speed = K.speed * 2; if (this.st > 4) { this.state = 'larva'; this.st = 0; } }
    else if (this.state === 'larva' && !this.stunT) {
      speed = Math.hypot(gp.x - p.x, gp.z - p.z) > 60 ? K.speed : 0;
      if ((this.ramT -= dt) <= 0 && Math.abs(dh) < 0.5) { this.state = 'ram'; this.st = 0; this.ramDir = toG; this.events.emit('battraRoar', {}); }
      if ((this.beamT -= dt) <= 0) { this.beamT = K.beamEvery * (0.8 + 0.4 * Math.random()); this.beam.t = K.beamDur; this.events.emit('prismBeam', {}); }
    } else if (this.state === 'ram') {
      speed = K.ramSpeed; dh = 0; this.heading = this.ramDir;
      if (Math.hypot(gp.x - p.x, gp.z - p.z) < 38) {                // Treffer (größer als der Abstoßradius 34): Godzilla wird zurückgestoßen
        g.takeDamage(K.ramDmg, gp);
        this.knock = { dir: this.ramDir, t: 0.5 };
        this.events.emit('shake', 1.4);
        this.state = 'larva'; this.ramT = K.ramEvery * (0.8 + 0.4 * Math.random());
      } else if (this.st > 1.5) { this.state = 'larva'; this.ramT = K.ramEvery * (0.8 + 0.4 * Math.random()); }
    } else if (this.state === 'burrow') {
      if (Math.random() < dt * 14) this.fx.dust.emit(p.x, 2, p.z, 3, { spread: 30, up: 8, out: 12, size: 28, life: 3 });
      if (Math.random() < dt * 2) this.events.emit('shake', 0.6);
      if (this.st > 4) this.transform();
    }
    if (this.state !== 'ram') this.heading += THREE.MathUtils.clamp(dh, -0.6 * dt, 0.6 * dt);
    p.x += Math.sin(this.heading) * speed * dt;
    p.z += Math.cos(this.heading) * speed * dt;
    if (speed > 0 && city) city.crush(p.clone(), 20, dt);
    if (this.knock && (this.knock.t -= dt) > 0) { gp.x += Math.sin(this.knock.dir) * 50 * dt; gp.z += Math.cos(this.knock.dir) * 50 * dt; }
    // Spur: der Körper folgt dem Kopf wie eine Schlange
    const last = this.trail[0];
    if (!last || last.distanceTo(p) > 4) this.trail.unshift(p.clone());
    if (this.trail.length > 60) this.trail.length = 60;
    const back = k => {                                        // Punkt k Meter hinter dem Kopf
      let acc = 0, prev = p;
      for (const q of this.trail) { const d = prev.distanceTo(q); if (acc + d >= k) return prev.clone().lerp(q, (k - acc) / d); acc += d; prev = q; }
      return prev.clone().add(new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)).multiplyScalar(k - acc));
    };
    const sink = this.state === 'rise' ? Math.max(0, 1 - this.st / 3) * 25 : this.state === 'burrow' ? Math.min(1, this.st / 3.5) * 30 : 0;
    const wig = Math.sin(this.st * 3) * 3;
    const root = p.clone().setY(LARVA_R[0] - sink);
    const c1 = back(LARVA_LEN * 0.33).setY(LARVA_R[0] * 0.9 - sink).addScaledVector(new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)), wig);
    const c2 = back(LARVA_LEN * 0.66).setY(LARVA_R[0] * 0.7 - sink);
    const tip = back(LARVA_LEN).setY(LARVA_R[1] - sink);
    this.body.pose(root, c1, c2, tip, tip.clone().sub(c2));
    this.head.position.copy(root).add(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(4));
    this.head.lookAt(_a.copy(this.head.position).add(new THREE.Vector3(Math.sin(this.heading), this.state === 'ram' ? -0.15 : 0.05, Math.cos(this.heading))));
    this.center.copy(root);
    // Godzilla kann nicht durch sie hindurchlaufen
    const d = Math.hypot(gp.x - p.x, gp.z - p.z);
    if (d < 34 && d > 0.01 && this.state !== 'burrow') { gp.x = p.x + (gp.x - p.x) / d * 34; gp.z = p.z + (gp.z - p.z) / d * 34; }
    // Prismenstrahl aus dem Horn
    if (this.beam.t > 0 && !this.stunT) {
      this.beam.t -= dt;
      fireBeam(this.beam, dt, this.head.localToWorld(_c.set(0, 14, 26)), g, city, K.beamDps, this.fx);
    } else this.beam.update(dt, false);
  }

  transform() {
    this.form = 'imago'; this.state = 'emerge'; this.st = 0; this.hp = 100;
    this.body.visible = this.head.visible = false;
    this.beam.update(0, false);
    const o = this.imago.group;
    o.position.set(this.pos.x, -20, this.pos.z);
    o.visible = true;
    this.beamT = 4; this.diveT = 8;
    this.events.emit('battraChange', { title: 'BATTRA ENTFALTET SICH' });
    this.events.emit('battraRoar', {});
  }

  // ---------- Falter ----------
  updateImago(dt, g, city) {
    const K = BAT.imago, o = this.imago.group, gp = g.position;
    let alt = K.alt + 6 * Math.sin(this.st * 0.8), want = (K.range[0] + K.range[1]) / 2;
    if (this.dead) return this.crash(dt, city);
    if (this.state === 'emerge') { alt = 90; if (this.st > 4) { this.state = 'imago'; this.st = 0; } }
    if (this.state === 'imago' && !this.stunT) {
      if ((this.beamT -= dt) <= 0) { this.beamT = K.beamEvery * (0.8 + 0.4 * Math.random()); this.beam.t = this.beam2.t = K.beamDur; this.events.emit('prismBeam', {}); }
      if ((this.diveT -= dt) <= 0) { this.state = 'dive'; this.st = 0; this.hitDone = false; this.events.emit('battraRoar', {}); }
    }
    if (this.state === 'dive') {                                   // Sturzflug auf Godzillas Brust
      alt = Math.max(45, clearAlt(city, gp.x, gp.z, 70) + 10); want = 10;
      if (!this.hitDone && o.position.distanceTo(_a.copy(gp).setY(50)) < 30) {
        this.hitDone = true; g.takeDamage(K.diveDmg, gp); this.events.emit('shake', 1.2);
      }
      if (this.st > 3 || this.hitDone && this.st > 1) { this.state = 'imago'; this.diveT = K.diveEvery * (0.8 + 0.4 * Math.random()); }
    }
    orbit(o, dt, gp, alt, want, this.state === 'dive' ? 70 : 35, this.state === 'dive' ? 0 : 0.06, this.state === 'dive' ? null : city);
    faceTo(o, gp, dt, 1.4, this.state === 'dive' ? 0.35 : 0.1);
    this.imago.flap(dt, this.state === 'dive' ? 2 : 4.5, this.state === 'dive' ? 0.15 : 0.55);
    this.center.copy(o.position).setY(o.position.y + 2);
    // rote Strahlen aus beiden Augen
    [this.beam, this.beam2].forEach((b, i) => {
      if (b.t > 0 && !this.stunT) { b.t -= dt; fireBeam(b, dt, o.localToWorld(_c.set(i ? -5 : 5, 2, 24)), g, city, K.beamDps * 0.5, this.fx); }
      else b.update(dt, false);
    });
  }

  crash(dt, city) {
    const o = this.imago.group, p = o.position;
    this.vy = (this.vy || 0) - 18 * dt;
    p.y = Math.max(0, p.y + this.vy * dt);
    o.rotation.z += dt * 0.8;
    this.imago.flap(dt, 9, 0.3);
    this.fx.fire.emit(p.x, p.y, p.z, 2, { spread: 10, up: 4, out: 4, size: 16, life: 0.8 });
    if (p.y <= 0.5 && this.active) {
      this.military.boom(p, 2.2);
      this.fx.dust.emit(p.x, 0, p.z, 26, { spread: 40, up: 6, out: 16, size: 28, life: 5 });
      if (city) city.damage(p.clone(), 50, 300, p.clone(), true, 20);
      this.events.emit('shake', 2.2);
      o.visible = false; this.active = false;
      this.beam.update(0, false); this.beam2.update(0, false);
      this.events.emit('bossCrash', { pos: p.clone() });
    }
  }

  // ---------- Schaden ----------
  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const D = BAT[this.form].dmg, c = this.center;
    if (e.kind === 'pulse') { if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 150 && c.y < 100) this.damage(D.pulse, true); return; }
    if (this.form === 'imago' && this.state !== 'dive') return;  // fliegend nur im Sturzflug erreichbar
    if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < e.radius + 20) this.damage(e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw, true);
  }

  beamLine(from, to, dt) {
    if (!this.fighting()) return;
    if (to.distanceTo(this.center) < (this.form === 'larva' ? 26 : 30)) this.damage(BAT[this.form].dmg.beam * dt);
  }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.center, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    if (this.form === 'larva') { this.state = 'burrow'; this.st = 0; this.beam.t = 0; this.events.emit('battraRoar', {}); }
    else { this.dead = true; this.vy = 0; this.beam.t = this.beam2.t = 0; this.events.emit('bossDown', {}); this.events.emit('battraRoar', {}); }
  }
}

// ======================= Mothra (Endgegnerin) =======================
const MO = { hp: 100, alt: 62, range: [140, 200], beamEvery: 3.0, beamDur: 1.6, beamDps: 3.0, powderEvery: 18,
  powderDur: 8, powderDps: 1.5, reflectDps: 4, gustEvery: 15, gustDur: 3.5,
  dmg: { beam: 3.5, claw: 4, tail: 6, pulse: 8 } };

export class Mothra {
  constructor(gltf, scene, fx, events, glow, military) {
    this.scene = scene; this.fx = fx; this.events = events; this.glow = glow; this.military = military;
    this.moth = new Moth(gltf, scene, 'MO', 1.2);
    this.group = this.moth.group;
    this.beams = [makeBeam(scene, [1.6, 1.3, 0.25], [2.4, 2.2, 1.2]), makeBeam(scene, [1.6, 1.3, 0.25], [2.4, 2.2, 1.2])];
    this.bodyTarget = { mesh: { position: new THREE.Vector3() }, hp: 1 };
    this.active = false; this.dead = false; this.hp = MO.hp;
  }

  get label() { return 'MOTHRA'; }

  start(gz, city) {
    this.city = city;
    this.active = true; this.dead = false; this.hp = MO.hp;
    this.state = 'arrive'; this.st = 0;
    this.group.position.set(gz.x - 200, 160, (city ? city.bayZ : 600) + 500);   // fliegt über die Bucht heran
    this.group.visible = true;
    this.beamT = 4; this.powderT = 8; this.gustT = 12; this.powder = 0;
    this.events.emit('finalRise', { title: 'MOTHRA' });
    this.events.emit('mothraRoar', {});
  }

  fighting() { return this.active && !this.dead && this.state !== 'arrive'; }
  targets() { return this.fighting() ? [this.bodyTarget] : []; }
  rayHit(o, d, max) { return this.active && !this.dead ? sphereHit(this.bodyTarget.mesh.position, 22, o, d, max) : max; }

  // Schrei: kurz betäubt, und er bläst das Schuppenpulver weg
  stun(t) {
    if (!this.fighting()) return;
    this.stunT = t;
    for (const b of this.beams) b.t = 0;
    if (this.powder > 0) { this.powder = 0; this.events.emit('powderGone', {}); }
  }

  update(dt, g) {
    this.g = g;
    if (!this.active) return;
    this.st += dt;
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    const o = this.group, gp = g.position, city = this.city;
    if (this.dead) return this.crash(dt);
    let alt = MO.alt + 6 * Math.sin(this.st * 0.7), want = (MO.range[0] + MO.range[1]) / 2, flapRate = 3.2, flapAmp = 0.5;
    if (this.state === 'arrive') { alt = 110; if (Math.hypot(o.position.x - gp.x, o.position.z - gp.z) < MO.range[1] + 60) { this.state = 'fly'; this.st = 0; } }
    if (this.state === 'fly' && !this.stunT) {
      if ((this.beamT -= dt) <= 0) { this.beamT = MO.beamEvery * (0.8 + 0.4 * Math.random()); for (const b of this.beams) b.t = MO.beamDur; this.events.emit('mothraBeam', {}); }
      if ((this.powderT -= dt) <= 0) { this.powderT = MO.powderEvery; this.powder = MO.powderDur; this.events.emit('powderStart', {}); }
      if ((this.gustT -= dt) <= 0) { this.state = 'gust'; this.st = 0; this.events.emit('gustStart', {}); this.events.emit('mothraRoar', {}); }
    }
    if (this.state === 'gust') {                                    // Flügelsturm: tief vor Godzilla, schlägt kräftig
      alt = Math.max(26, clearAlt(city, gp.x, gp.z, 110) + 8); want = 90; flapRate = 7; flapAmp = 0.8;
      if (this.st > 1 && !this.stunT) {
        const dir = Math.atan2(gp.x - o.position.x, gp.z - o.position.z);
        gp.x += Math.sin(dir) * 9 * dt; gp.z += Math.cos(dir) * 9 * dt;   // drückt Godzilla weg
        g.speedCap = Math.min(g.speedCap ?? Infinity, 4);
        if (Math.random() < dt * 3 && city) {
          const at = o.position.clone().lerp(gp, 0.6).setY(0);
          city.damage(at, 45, 90, o.position, true, 15);
          this.fx.dust.emit(at.x, 2, at.z, 6, { spread: 30, up: 4, out: 26, size: 26, life: 2.5 });
        }
      }
      if (this.st > MO.gustDur) { this.state = 'fly'; this.gustT = MO.gustEvery * (0.8 + 0.4 * Math.random()); g.speedCap = Infinity; }
    }
    orbit(o, dt, gp, alt, want, 34, this.state === 'gust' ? 0 : 0.05, this.state === 'gust' ? null : city);
    faceTo(o, gp, dt, 1.2, this.state === 'gust' ? -0.25 : 0.08);
    this.moth.flap(dt, flapRate, flapAmp);
    this.bodyTarget.mesh.position.copy(o.position).setY(o.position.y + 2);
    // Schuppenpulver: goldene Glitzerwolke um sie herum, brennt Godzilla, wenn er drinsteht
    if (this.powder > 0) {
      this.powder -= dt;
      const c = this.bodyTarget.mesh.position;
      for (let k = 0; k < 3; k++) this.glow.emit(c.x, c.y - 10, c.z, 1, { spread: 60, up: -2, out: 6, size: 7, life: 2.5, color: [1.0, 0.85, 0.4] });
      if (Math.hypot(gp.x - c.x, gp.z - c.z) < 110) g.takeDamage(MO.powderDps * dt, gp);
      if (this.powder <= 0) this.events.emit('powderGone', {});
    }
    // gelbe Strahlen aus den Fühlerspitzen
    this.beams.forEach((b, i) => {
      if (b.t > 0 && !this.stunT) { b.t -= dt; fireBeam(b, dt, o.localToWorld(_c.set(i ? -12 : 12, 14, 40)), g, city, MO.beamDps * 0.5, this.fx); }
      else b.update(dt, false);
    });
  }

  crash(dt) {
    const o = this.group, p = o.position;
    this.vy = (this.vy || 0) - 10 * dt;                             // sinkt langsam, Flügel schlagen matt
    p.y = Math.max(0, p.y + this.vy * dt);
    o.rotation.z += dt * 0.4;
    this.moth.flap(dt, 2, 0.25);
    this.glow.emit(p.x, p.y, p.z, 1, { spread: 20, up: 3, out: 4, size: 8, life: 3, color: [1.0, 0.85, 0.4] });
    if (p.y <= 0.5 && this.active) {
      this.fx.dust.emit(p.x, 0, p.z, 24, { spread: 50, up: 5, out: 16, size: 28, life: 5 });
      this.events.emit('shake', 1.6);
      o.visible = false; this.active = false;
      for (const b of this.beams) b.update(0, false);
      this.events.emit('finalGone', {});
    }
  }

  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    const c = this.bodyTarget.mesh.position;
    if (e.kind === 'pulse') {
      if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 150 && c.y < 100) { this.damage(MO.dmg.pulse, true); this.stun(0.5); }
      return;
    }
    if (this.state !== 'gust') return;                             // nur beim Flügelsturm erreichbar
    if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < e.radius + 26) this.damage(e.kind === 'tail' ? MO.dmg.tail * Math.min(1, e.damage / 100) : MO.dmg.claw, true);
  }

  // Atomstrahl: im Schuppenpulver wird er zurückgeworfen (Godzilla nimmt Schaden), sonst trifft er
  beamLine(from, to, dps, dt) {
    if (!this.fighting()) return;
    if (to.distanceTo(this.bodyTarget.mesh.position) > 30) return;
    if (this.powder > 0) {
      this.g?.takeDamage(MO.reflectDps * dt, this.g.position);
      if (Math.random() < dt * 20) this.glow.emit(to.x, to.y, to.z, 2, { spread: 6, up: 4, out: 18, size: 9, life: 0.6, color: [1, 0.9, 0.5] });
      if (!this.reflectNote) { this.reflectNote = true; this.events.emit('powderReflect', {}); }
      return;
    }
    this.damage(MO.dmg.beam * dt);
  }

  damage(n, big) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (big) { this.military.boom(this.bodyTarget.mesh.position, 0.7); this.events.emit('bossHit', {}); }
    if (this.hp > 0) return;
    this.dead = true; this.vy = 0; this.powder = 0;
    for (const b of this.beams) b.t = 0;
    this.events.emit('mothraRoar', {});
    this.events.emit('finalDown', { title: 'MOTHRA IST BESIEGT' });
  }
}
