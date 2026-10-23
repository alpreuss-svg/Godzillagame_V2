// Endgegner 1989: Biollante in zwei Stufen (wie im Film).
// 1. Rosenform: wächst aus dem Fluss, steht fest, Fangranken mit Mäulern schlagen zu und umschlingen Godzilla, aus der
//    Rose spritzt ätzender Saft. Besiegt verbrennt sie und zerfällt in goldene Sporen.
// 2. Bestienform: steigt aus dem Fluss, kriecht auf Godzilla zu und walzt Gebäude nieder, mehr und längere Ranken,
//    spuckt Saft aus dem Maul. Schwachstelle ist der glühende Kern in der Brust (Atomstrahl). Besiegt löst sie sich in
//    goldene Sporen auf, die in den Himmel steigen.
// Ranken: Schlauch mit Knochenkette (SkinnedMesh), die Kette folgt jedes Bild einer Bezierkurve von der Wurzel zur Spitze.
import * as THREE from 'three';
import { Chain, SEG, ease, segDist } from './chain.js';

const FORMS = {
  rose: {
    hp: 100, radius: 26, coreR: 14, speed: 0, turn: 0.25, vineLen: 100, vineR: [3.4, 2.2],
    core: [0, 31, 11.5], mouth: [0, 93, 9], chest: 50,
    // Wurzeln der Ranken (Modell: x, Höhe, vorn = +z) und Richtung, in die sie wachsen
    vines: [[200, 40], [240, 52], [300, 46], [340, 56], [25, 36], [150, 60]].map(([a, h]) => {
      const r = Math.PI / 180 * a, R = 13 - h * 0.06;   // Grad in Blender-XY, vorn = 270°
      return { root: [Math.cos(r) * R, h, -Math.sin(r) * R], dir: [Math.cos(r), 0.35, -Math.sin(r)] };
    }),
    attackEvery: 4.5, hitDamage: 2, grabDps: 0, grabChance: 0,
    acidEvery: 14, acidDur: 1.8, acidDps: 1.2, acidRange: 330,
    bindEvery: 24, bindDps: 1.5, bindVines: 3, bindMax: 6,
    // wie im Film: viel Ausdauer, wenige Angriffe
    dmg: { beam: 2.2, core: 1.5, claw: 1.8, tail: 2.5, pulse: 4, vine: 1 },
  },
  beast: {
    hp: 100, radius: 34, coreR: 15, speed: 5, turn: 0.45, vineLen: 118, vineR: [3.8, 2.4],
    core: [0, 40, 23.5], mouth: [0, 75, 44], chest: 45,
    vines: [[24, 48, -8], [-24, 48, -8], [30, 40, 8], [-30, 40, 8], [18, 60, 16], [-18, 60, 16], [34, 30, -14], [-34, 30, -14]]
      .map(([x, h, y]) => ({ root: [x, h, -y], dir: [Math.sign(x) * 0.9, 0.55, -y / 30] })),
    attackEvery: 1.4, hitDamage: 4, grabDps: 0, grabChance: 0,
    acidEvery: 7, acidDur: 2.2, acidDps: 2.5, acidRange: 340,
    bindEvery: 17, bindDps: 2.5, bindVines: 3, bindMax: 6,
    biteEvery: 20, biteDps: 3.5, biteMax: 7, biteFree: 0.8, biteRange: 95,
    // zäh und angriffslustig; der Strahl in den Schlund beim Biss trifft hart (biteBeam)
    dmg: { beam: 1.6, core: 2, claw: 1.5, tail: 2.2, pulse: 3, vine: 0.8, biteBeam: 12 },
  },
};
const VINE_HP = 25, REGROW = 15;
const RISE_T = 6, BURN_T = 4, SPORE_T = 5, EMERGE_T = 6, DIE_T = 7;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// Fangranke: Kette mit Rankenkopf an der Spitze, abreißbar (hp) und vom Strahl erfassbar (target)
class Vine extends Chain {
  constructor(scene, head, mat, len, r0, r1) {
    super(scene, mat, len, r0, r1, { head });
    this.target = { mesh: { position: this.tip }, hp: VINE_HP };
    this.state = 'idle';
    this.t = 0;
  }
}

export class Biollante {
  constructor(gltf, scene, fx, events, glow) {
    this.scene = scene;
    this.fx = fx;
    this.events = events;
    this.glow = glow;                         // additive Partikel für Saft und Sporen
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const get = n => gltf.scene.getObjectByName(n);
    this.models = { rose: get('BI_rose').clone(), beast: get('BI_beast').clone() };
    for (const m of Object.values(this.models)) {
      m.position.set(0, 0, 0);
      m.traverse(o => {
        if (!o.isMesh) return;
        o.receiveShadow = true;
        if (/Glow/.test(o.material.name)) o.material.emissiveIntensity = 0.8;   // Rankennetz über dem Kern soll sichtbar bleiben
      });
      m.visible = false;
      this.group.add(m);
    }
    const head = get('BI_head');
    let vineMat = null;
    head.traverse(o => { if (o.isMesh && /Vine/.test(o.material.name)) vineMat = o.material; });
    this.vines = { rose: [], beast: [] };
    for (const form of ['rose', 'beast']) {
      const F = FORMS[form];
      for (const v of F.vines) {
        const h = head.clone();
        h.position.set(0, 0, 0);
        h.rotation.set(0, 0, 0);
        const vine = new Vine(scene, h, vineMat, F.vineLen, F.vineR[0], F.vineR[1]);
        vine.rootLocal = new THREE.Vector3(...v.root);
        vine.dirLocal = new THREE.Vector3(...v.dir).normalize();
        vine.visible = false;
        this.vines[form].push(vine);
      }
    }
    // ein festes Licht für das Glühen des Kerns (Lichtanzahl bleibt gleich, sonst übersetzt Three.js die Shader neu)
    this.light = new THREE.PointLight(0xff8a30, 0, 180, 1.4);
    scene.add(this.light);
    this.active = false;
    this.dead = false;
    this.form = 'rose';
    this.state = 'off';
    this.hp = 100;
    this.coreWorld = new THREE.Vector3();
    this.bodyTarget = { mesh: { position: this.coreWorld }, hp: 1 };
    this.acid = null;
  }

  get F() { return FORMS[this.form]; }

  // Auftritt: die Rose wächst aus dem Fluss, auf Höhe von Godzilla
  start(gz, city) {
    const river = city.rivers[0];
    const z = river ? (river.z0 + river.z1) / 2 : city.bayZ + 60;
    this.group.position.set(THREE.MathUtils.clamp(gz.x, -320, 320), -110, z);
    this.group.rotation.y = Math.atan2(gz.x - this.group.position.x, gz.z - z);
    this.city = city;
    this.active = true;
    this.group.visible = true;
    this.setForm('rose');
    this.enter('rise');
    this.events.emit('finalRise', { title: 'BIOLLANTE' });
  }

  setForm(form) {
    for (const v of this.vines[this.form]) v.visible = false;
    this.form = form;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === form;
    for (const v of this.vines[form]) { v.visible = true; v.state = 'idle'; v.grow = 1; v.target.hp = VINE_HP; v.head.visible = true; }
    this.hp = this.F.hp;
    this.attackT = 3;
    this.acidT = this.F.acidEvery * 0.6;
    this.bindT = this.F.bindEvery * 0.5;
    this.biteT = (this.F.biteEvery || 0) * 0.6;
    this.hold = null;
  }

  enter(state) { this.state = state; this.st = 0; }

  // Ziele für die Zielerfassung des Atomstrahls: Rankenköpfe und der Kern
  targets() {
    if (!this.fighting()) return [];
    return this.vines[this.form].filter(v => v.target.hp > 0 && v.state !== 'cut').map(v => v.target).concat(this.bodyTarget);
  }

  fighting() { return this.active && (this.state === 'rose' || this.state === 'beast'); }

  // Strahl endet am Körper (Kugel um die Brust)
  rayHit(o, d, max) {
    if (!this.active || this.state === 'dying') return max;
    const c = _a.copy(this.group.position).setY(this.group.position.y + this.F.chest);
    const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z, R = this.F.radius;
    const t = ox * d.x + oy * d.y + oz * d.z, q = ox * ox + oy * oy + oz * oz - t * t;
    if (ox * ox + oy * oy + oz * oz < R * R) return Math.min(max, 14);   // Maul steckt in ihr (Biss): Explosion im Schlund
    if (t < 0 || q > R * R) return max;
    return Math.min(max, t - Math.sqrt(R * R - q));
  }

  update(dt, g) {
    this.g = g;
    if (!this.active) return;
    g.speedCap = Infinity;
    this.st += dt;
    this.t = (this.t || 0) + dt;
    const G = this.group, gp = g.position, F = this.F;
    const dx = gp.x - G.position.x, dz = gp.z - G.position.z, dist = Math.hypot(dx, dz);
    // Körper dreht sich langsam zu Godzilla
    const want = Math.atan2(dx, dz);
    let dy = want - G.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (this.state !== 'dying') G.rotation.y += THREE.MathUtils.clamp(dy, -F.turn * dt, F.turn * dt);
    G.updateMatrixWorld(true);
    this.coreWorld.set(...F.core).applyMatrix4(G.matrixWorld);
    this.light.position.copy(this.coreWorld).addScaledVector(_a.set(Math.sin(G.rotation.y), 0, Math.cos(G.rotation.y)), 30);
    this.light.intensity = this.state === 'off' ? 0 : 600 * (0.8 + 0.2 * Math.sin(this.t * 3));

    switch (this.state) {
      case 'rise': case 'emerge': {         // wächst aus dem Wasser, Gischt und Beben
        const T = this.state === 'rise' ? RISE_T : EMERGE_T, k = Math.min(1, this.st / T);
        G.position.y = -110 * (1 - ease(k));
        if (Math.random() < dt * 14) this.fx.dust.emit(G.position.x, 2, G.position.z, 2, { spread: 40, up: 9, out: 10, size: 26, life: 3, color: [0.55, 0.6, 0.66] });
        if (Math.random() < dt * 2) this.events.emit('shake', 0.5);
        if (k >= 1) { this.enter(this.form); this.events.emit('biollanteRoar', { form: this.form }); }
        break;
      }
      case 'burn': {                        // Rose verbrennt
        const c = this.coreWorld;
        if (Math.random() < dt * 30) this.fx.fire.emit(c.x, c.y + Math.random() * 60, c.z, 2, { spread: 18, up: 8, out: 4, size: 22, life: 1.4 });
        if (Math.random() < dt * 8) this.fx.dust.emit(c.x, c.y + 50, c.z, 1, { spread: 14, up: 10, out: 3, size: 30, life: 5, color: [0.08, 0.08, 0.08] });
        for (const v of this.vines.rose) v.grow = Math.max(0.02, 1 - this.st / BURN_T);
        if (this.st > BURN_T) { this.enter('spores'); this.events.emit('biollanteSpores', {}); }
        break;
      }
      case 'spores': {                      // goldene Sporen steigen auf, die Rose sinkt ins Wasser
        G.position.y = -110 * ease(Math.min(1, this.st / SPORE_T));
        this.spores(dt, 40);
        if (this.st > SPORE_T + 1.5) {
          this.setForm('beast');
          this.enter('emerge');
          this.events.emit('finalRise', { title: 'BIOLLANTE ERWACHT' });
        }
        break;
      }
      case 'rose': case 'beast':
        this.fight(dt, g, dist);
        break;
      case 'dying': {                       // löst sich in Sporen auf, die in den Himmel steigen
        G.position.y = -95 * ease(Math.min(1, this.st / DIE_T));
        this.spores(dt, 70);
        for (const v of this.vines.beast) v.grow = Math.max(0.02, 1 - this.st / 3);
        if (this.st > DIE_T) {
          this.active = false;
          this.group.visible = false;
          for (const v of this.vines.beast) v.visible = false;
          this.light.intensity = 0;
          this.events.emit('finalGone', {});
        }
        break;
      }
    }
    this.updateHold(dt, g);
    this.updateVines(dt, g);
    this.updateAcid(dt, g);
    // Godzilla kann nicht durch sie hindurchlaufen
    const minD = F.radius + 16;
    if (this.state !== 'dying' && !this.hold && dist < minD && dist > 0.01) { gp.x = G.position.x + dx / dist * minD; gp.z = G.position.z + dz / dist * minD; }
  }

  // ---------- Festhalten: Ranken-Fessel (beide Formen) und Kopf im Maul (Bestie) ----------
  startBind(g) {
    const free = this.vines[this.form].filter(v => v.state === 'idle' && v.grow > 0.95);
    if (free.length < 2) return false;
    free.sort((a, b) => a.tip.distanceTo(g.position) - b.tip.distanceTo(g.position));
    const vs = free.slice(0, this.F.bindVines);
    vs.forEach((v, i) => { v.state = 'bind'; v.t = 0; v.slot = i; v.from = v.tip.clone(); });
    this.hold = { kind: 'vines', t: 0, vines: vs };
    g.held = 'vines';
    this.events.emit('bindStart', {});
    return true;
  }

  startBite(g) {
    this.hold = { kind: 'bite', t: 0, fire: 0 };
    g.held = 'bite';
    this.events.emit('biteStart', {});
    this.events.emit('shake', 1.2);
  }

  release(g, how) {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    g.held = null;
    if (h.kind === 'vines') {
      for (const v of h.vines) {
        if (v.state !== 'bind') continue;
        if (how === 'timeout') { v.state = 'retract'; v.t = 0; }
        else { v.state = 'cut'; v.t = 0; v.head.visible = false; v.target.hp = 0; }
      }
      this.bindT = this.F.bindEvery * (0.8 + 0.4 * Math.random());
    } else {
      this.biteT = this.F.biteEvery * (0.8 + 0.4 * Math.random());
      this.recoil = how === 'beam' ? 1 : 0.4;
      if (how === 'beam') {
        const m = _a.set(...this.F.mouth).applyMatrix4(this.group.matrixWorld);
        this.fx.fire.emit(m.x, m.y, m.z, 14, { spread: 10, up: 6, out: 14, size: 26, life: 1.2 });
        this.events.emit('shake', 1.5);
      }
    }
    this.events.emit('holdFree', { kind: h.kind, how });
    if (how !== 'timeout' && this.fighting()) this.damage(h.kind === 'bite' ? this.F.dmg.biteBeam : 0);
  }

  updateHold(dt, g) {
    const lean = this.models.beast;
    // Bestie: beim Biss nach vorn gebeugt, danach federt sie zurück
    const want = this.hold && this.hold.kind === 'bite' ? 0.08 : 0;
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 1.5);
    lean.rotation.x += (want - this.recoil * 0.25 - lean.rotation.x) * Math.min(1, dt * 4);
    const h = this.hold;
    if (!h) return;
    if (!this.fighting() || g.state === 'dead') { this.release(g, 'timeout'); return; }
    h.t += dt;
    g.speedCap = 0;
    if (Math.random() < dt * 3) this.events.emit('shake', 0.25);
    if (h.kind === 'vines') {
      g.takeDamage(this.F.bindDps * dt, g.position);
      g.hurt = 0;
      if (g.firing && h.t > 0.3) this.release(g, 'beam');            // Strahl verbrennt die Ranken
      else if (h.t > this.F.bindMax) this.release(g, 'timeout');
    } else {
      // Godzilla steht vor ihr, sein Kopf steckt in ihrem Maul
      const G = this.group, fx = Math.sin(G.rotation.y), fz = Math.cos(G.rotation.y);
      const d = this.F.mouth[2] + 6 + 17;                 // Maul (vorgebeugt ~6 m weiter vorn) + Godzillas Kopf vor seinem Körper
      g.position.x += (G.position.x + fx * d - g.position.x) * Math.min(1, dt * 6);
      g.position.z += (G.position.z + fz * d - g.position.z) * Math.min(1, dt * 6);
      g.heading = Math.atan2(-fx, -fz);
      g.takeDamage(this.F.biteDps * dt, g.position);
      g.hurt = 0;
      if (g.firing) h.fire += dt;
      if (h.fire > this.F.biteFree) this.release(g, 'beam');        // Strahl in den Schlund
      else if (h.t > this.F.biteMax) this.release(g, 'timeout');
    }
  }

  // Schrei: kurz betäubt – Ranken ziehen sich zurück, kein Saft, kein neuer Angriff
  stun(t) {
    if (!this.fighting() || this.hold) return;
    this.stunT = t;
    this.acid = null;
    for (const v of this.vines[this.form]) if (v.state === 'wind' || v.state === 'strike') { v.state = 'retract'; v.t = 0; }
  }

  fight(dt, g, dist) {
    const F = this.F, G = this.group;
    if (this.stunT > 0) { this.stunT -= dt; return; }
    // Bestie kriecht auf Godzilla zu und walzt Gebäude nieder
    if (F.speed && dist > F.radius + 70) {
      const k = F.speed * dt / dist;
      G.position.x += (g.position.x - G.position.x) * k;
      G.position.z += (g.position.z - G.position.z) * k;
      if (this.city) this.city.crush(_a.copy(G.position), F.radius + 12, dt);
    }
    if (F.speed && Math.random() < dt * 1.5) this.events.emit('shake', 0.15);
    // Festhalten: Biss, wenn Godzilla direkt vor ihr steht, sonst Ranken-Fessel
    if (!this.hold) {
      const front = Math.cos(Math.atan2(g.position.x - G.position.x, g.position.z - G.position.z) - G.rotation.y) > 0.6;
      if (F.biteEvery && (this.biteT -= dt) <= 0 && dist < F.biteRange && front && g.state !== 'dead') this.startBite(g);
      else if ((this.bindT -= dt) <= 0 && dist < F.vineLen * 1.1 && g.state !== 'dead' && !this.startBind(g)) this.bindT = 2;
    }
    // Rankenangriff: eine freie Ranke holt aus und schlägt zu
    if (!this.hold && (this.attackT -= dt) <= 0) {
      this.attackT = F.attackEvery * (0.7 + 0.6 * Math.random());
      const free = this.vines[this.form].filter(v => v.state === 'idle' && v.grow > 0.95);
      const reach = free.filter(v => v.tip.distanceTo(_a.copy(g.position).setY(45)) < v.len * 1.25);
      const v = reach[Math.floor(Math.random() * reach.length)];
      if (v) { v.state = 'wind'; v.t = 0; v.windTip = v.tip.clone(); }
    }
    // ätzender Saft aus Rose bzw. Maul
    if (!this.hold && (this.acidT -= dt) <= 0 && dist < F.acidRange) {
      this.acidT = F.acidEvery * (0.8 + 0.4 * Math.random());
      this.acid = { t: 0 };
      this.events.emit('biollanteAcid', {});
    }
  }

  spores(dt, rate) {
    const p = this.coreWorld;
    if (Math.random() < dt * rate) {
      this.glow.emit(p.x, p.y + Math.random() * 40, p.z, 2, { spread: 45, up: 30, out: 6, size: 9, life: 5, color: [1.0, 0.82, 0.35] });
    }
  }

  updateAcid(dt, g) {
    if (!this.acid) return;
    const F = this.F, a = this.acid;
    a.t += dt;
    if (!this.fighting() || a.t > F.acidDur) { this.acid = null; return; }
    const from = _a.set(...F.mouth).applyMatrix4(this.group.matrixWorld);
    const to = _b.copy(g.position).setY(48);
    const d = from.distanceTo(to);
    for (let k = 0; k < 5; k++) {
      const s = Math.random();
      const p = _c.copy(from).lerp(to, s);
      p.y += Math.sin(Math.PI * s) * d * 0.12;               // leichter Bogen
      this.glow.emit(p.x, p.y, p.z, 1, { spread: 3, up: -3, out: 2, size: 9, life: 0.5, color: [0.75, 0.95, 0.25] });
    }
    if (d < F.acidRange + 20) {
      g.takeDamage(F.acidDps * dt, to);
      if (Math.random() < dt * 10) this.fx.dust.emit(to.x, to.y, to.z, 1, { spread: 6, up: 3, out: 3, size: 12, life: 1.5, color: [0.5, 0.55, 0.3] });
    }
  }

  updateVines(dt, g) {
    const F = this.F, G = this.group;
    const chest = _d.copy(g.position).setY(46).clone();
    const up = Y;
    for (const v of this.vines[this.form]) {
      if (!v.mesh.visible) continue;
      v.t += dt;
      const root = v.rootLocal.clone().applyMatrix4(G.matrixWorld);
      const out = v.dirLocal.clone().applyQuaternion(G.quaternion).setY(0).normalize();
      const L = v.len * v.grow, ph = v.phase + this.t;
      const toG = chest.clone().sub(root).setY(0).normalize();
      // Ruhe: S-Bogen nach außen und oben, der Kopf schaut zu Godzilla, schlängelt sich
      const sway = new THREE.Vector3(Math.sin(ph * 0.9) * 14, Math.sin(ph * 1.3) * 8, Math.cos(ph * 0.7) * 14);
      let tip = root.clone().addScaledVector(out, L * 0.42).addScaledVector(toG, L * 0.12).addScaledVector(up, L * 0.55).add(sway);
      let c1 = root.clone().addScaledVector(out, L * 0.45).addScaledVector(up, -L * 0.05);
      let c2 = tip.clone().addScaledVector(up, -L * 0.4).addScaledVector(out, L * 0.1);
      let aim = chest.clone().sub(tip);
      aim.y = Math.min(aim.y, -0.3 * Math.hypot(aim.x, aim.z));
      if (v.state === 'wind') {                    // holt aus: zieht sich zurück und richtet sich auf
        const k = ease(Math.min(1, v.t / 0.6));
        tip.lerp(root.clone().addScaledVector(out, L * 0.3).addScaledVector(up, L * 0.75).addScaledVector(toG, -L * 0.1), k);
        c2 = tip.clone().addScaledVector(up, -L * 0.35);
        if (v.t > 0.6) { v.state = 'strike'; v.t = 0; v.from = tip.clone(); v.aimAt = chest.clone(); }
      } else if (v.state === 'strike') {           // schnellt vor
        const k = Math.min(1, v.t / 0.32);
        tip = v.from.clone().lerp(v.aimAt, ease(k));
        c1 = root.clone().addScaledVector(out, L * 0.25).addScaledVector(up, L * 0.25);
        c2 = tip.clone().addScaledVector(up, L * 0.3).addScaledVector(toG, -L * 0.15);
        aim = v.aimAt.clone().sub(v.from);
        if (k >= 1) {
          const hit = Math.hypot(v.tip.x - g.position.x, v.tip.z - g.position.z) < 20 && v.tip.y > 8 && v.tip.y < 80;
          if (hit) {
            g.takeDamage(F.hitDamage, v.tip.clone());
            this.events.emit('vineBite', { pos: v.tip.clone() });
            this.fx.dust.emit(v.tip.x, v.tip.y, v.tip.z, 3, { spread: 4, up: 2, out: 6, size: 10, life: 1, color: [0.35, 0.3, 0.25] });
          }
          const holding = this.vines[this.form].some(o => o.state === 'grab');   // nur eine Ranke hält fest
          v.state = hit && !holding && Math.random() < F.grabChance ? 'grab' : 'retract';
          v.t = 0;
          if (v.state === 'grab') this.events.emit('vineGrab', {});
        }
      } else if (v.state === 'grab') {             // umschlingt Godzilla, bremst und würgt
        tip = chest.clone().add(new THREE.Vector3(Math.sin(v.t * 3) * 3, Math.sin(v.t * 5) * 2, 0));
        c1 = root.clone().addScaledVector(out, L * 0.3).addScaledVector(up, L * 0.2);
        c2 = tip.clone().addScaledVector(toG, -L * 0.25).addScaledVector(up, L * 0.15);
        aim = toG.clone();
        g.speedCap = Math.min(g.speedCap, 3);
        g.takeDamage(F.grabDps * dt, chest);
        if (v.t > 3.5) { v.state = 'retract'; v.t = 0; }
      } else if (v.state === 'bind') {
        const k = ease(Math.min(1, v.t / 0.4));
        let at;
        if (v.slot === 0) at = g.bones.handL.getWorldPosition(new THREE.Vector3());       // durch die Handfläche
        else at = chest.clone().add(new THREE.Vector3(Math.sin(v.t * 2 + v.slot * 2.1) * 9, (v.slot === 1 ? 6 : -14) + Math.sin(v.t * 3) * 2,
          Math.cos(v.t * 2 + v.slot * 2.1) * 9));                                      // umschlingt Brust und Bauch
        tip = v.from.clone().lerp(at, k);
        c1 = root.clone().addScaledVector(out, L * 0.3).addScaledVector(up, L * 0.25);
        c2 = tip.clone().addScaledVector(toG, -L * 0.2).addScaledVector(up, L * 0.2);
        aim = at.clone().sub(root).setY(0);
        if (v.slot === 0 && v.t > 0.4 && !v.pierced) {
          v.pierced = true;
          this.fx.dust.emit(at.x, at.y, at.z, 4, { spread: 2, up: 2, out: 6, size: 8, life: 1, color: [0.35, 0.12, 0.1] });
          this.events.emit('vineBite', { pos: at.clone() });
        }
      } else if (v.state === 'retract') {
        if (v.t > 0.8) { v.state = 'idle'; v.t = 0; }
      } else if (v.state === 'cut') {              // abgerissen: Kopf weg, Ranke fällt und zieht sich zurück
        tip = root.clone().addScaledVector(out, L * 0.6).setY(2);
        c2 = tip.clone().addScaledVector(up, L * 0.2);
        v.grow = Math.max(0.02, v.grow - dt * 0.5);
        if (v.t > REGROW) { v.state = 'regrow'; v.t = 0; v.head.visible = true; v.target.hp = VINE_HP; }
      } else if (v.state === 'regrow') {
        v.grow = Math.min(1, v.grow + dt * 0.4);
        if (v.grow >= 1) v.state = 'idle';
      }
      // weiche Übergänge: die Spitze folgt dem Ziel mit Trägheit (außer beim Zuschlagen)
      if (v.state !== 'bind') v.pierced = false;
      if (v.state !== 'strike' && v.state !== 'grab' && v.state !== 'bind') {
        v.smooth ??= tip.clone();
        v.smooth.lerp(tip, 1 - Math.exp(-5 * dt));
        tip = v.smooth;
      } else v.smooth = tip.clone();
      v.pose(root, c1, c2, tip, aim);
    }
  }

  // ---------- Schaden durch Godzilla ----------
  hitVines(test, amount) {
    let cut = 0;
    for (const v of this.vines[this.form]) {
      if (!v.mesh.visible || v.state === 'cut' || v.state === 'regrow' || v.grow < 0.5) continue;
      if (!test(v)) continue;
      v.target.hp -= amount;
      if (v.state === 'grab') { v.state = 'retract'; v.t = 0; }
      if (v.target.hp <= 0) {
        v.state = 'cut'; v.t = 0; v.head.visible = false; cut++;
        this.fx.dust.emit(v.tip.x, v.tip.y, v.tip.z, 6, { spread: 6, up: 4, out: 8, size: 14, life: 2, color: [0.2, 0.3, 0.12] });
        this.glow.emit(v.tip.x, v.tip.y, v.tip.z, 6, { spread: 4, up: 3, out: 10, size: 7, life: 1.2, color: [0.75, 0.95, 0.25] });
        this.events.emit('vineCut', {});
      }
    }
    if (cut) this.damage(cut * this.F.dmg.vine);
  }

  // Nahkampf und Kernpuls (Ereignis 'attack' von Godzilla)
  attack(e) {
    if (!this.fighting() || e.kind === 'beam') return;
    if (e.kind === 'pulse' && this.hold && this.hold.kind === 'vines') this.release(this.g, 'pulse');
    const D = this.F.dmg;
    const r = e.radius + 4;
    this.hitVines(v => v.dist(e.pos) < r + 4, e.kind === 'pulse' ? 40 : e.damage);
    const c = _a.copy(this.group.position).setY(Math.min(e.pos.y, this.F.chest));
    const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z) - this.F.radius;
    if (d < r) this.damage(e.kind === 'pulse' ? D.pulse : e.kind === 'tail' ? D.tail * Math.min(1, e.damage / 100) : D.claw);
  }

  // Atomstrahl: schneidet Ranken, brennt am Körper, am Kern doppelt
  beamLine(from, to, dps, dt) {
    if (!this.fighting()) return;
    this.hitVines(v => {
      for (let i = 0; i <= SEG; i += 2) if (segDist(v.pts[i], from, to) < 9) return true;
      return false;
    }, dps * dt);
    const end = to;
    const c = _b.copy(this.group.position).setY(this.group.position.y + this.F.chest);
    if (end.distanceTo(c) < this.F.radius + 6) {
      const core = end.distanceTo(this.coreWorld) < this.F.coreR + 6;
      this.damage(this.F.dmg.beam * (core ? this.F.dmg.core : 1) * dt);
      if (Math.random() < dt * 12) this.fx.fire.emit(end.x, end.y, end.z, 1, { spread: 4, up: 3, out: 3, size: 14, life: 0.8 });
    }
  }

  damage(n) {
    if (!this.fighting()) return;
    this.hp = Math.max(0, this.hp - n);
    if (this.hp > 0) return;
    this.acid = null;
    if (this.hold && this.g) this.release(this.g, 'timeout');
    for (const v of this.vines[this.form]) if (v.state === 'grab' || v.state === 'bind') v.state = 'retract';
    if (this.form === 'rose') { this.enter('burn'); this.events.emit('biollanteBurn', {}); }
    else { this.enter('dying'); this.dead = true; this.events.emit('finalDown', { title: 'BIOLLANTE STEIGT ALS LICHT IN DEN HIMMEL' }); }
  }

  get label() { return this.form === 'rose' ? 'BIOLLANTE – ROSE' : 'BIOLLANTE'; }
}
