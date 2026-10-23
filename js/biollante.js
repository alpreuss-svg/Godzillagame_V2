// Endgegner 1989: Biollante in zwei Stufen (wie im Film).
// 1. Rosenform: wächst aus dem Fluss, steht fest, Fangranken mit Mäulern schlagen zu und umschlingen Godzilla, aus der
//    Rose spritzt ätzender Saft. Besiegt verbrennt sie und zerfällt in goldene Sporen.
// 2. Bestienform: steigt aus dem Fluss, kriecht auf Godzilla zu und walzt Gebäude nieder, mehr und längere Ranken,
//    spuckt Saft aus dem Maul. Schwachstelle ist der glühende Kern in der Brust (Atomstrahl). Besiegt löst sie sich in
//    goldene Sporen auf, die in den Himmel steigen.
// Ranken: Schlauch mit Knochenkette (SkinnedMesh), die Kette folgt jedes Bild einer Bezierkurve von der Wurzel zur Spitze.
import * as THREE from 'three';

const SEG = 10;
const FORMS = {
  rose: {
    hp: 100, radius: 26, coreR: 14, speed: 0, turn: 0.25, vineLen: 100, vineR: [3.4, 2.2],
    core: [0, 31, 11.5], mouth: [0, 93, 9], chest: 50,
    // Wurzeln der Ranken (Modell: x, Höhe, vorn = +z) und Richtung, in die sie wachsen
    vines: [[200, 40], [240, 52], [300, 46], [340, 56], [25, 36], [150, 60]].map(([a, h]) => {
      const r = Math.PI / 180 * a, R = 13 - h * 0.06;   // Grad in Blender-XY, vorn = 270°
      return { root: [Math.cos(r) * R, h, -Math.sin(r) * R], dir: [Math.cos(r), 0.35, -Math.sin(r)] };
    }),
    attackEvery: 2.8, hitDamage: 2.5, grabDps: 1.0, grabChance: 0.25,
    acidEvery: 9, acidDur: 1.8, acidDps: 1.6, acidRange: 330,
    dmg: { beam: 7, core: 2, claw: 6, tail: 9, pulse: 10, vine: 3 },
  },
  beast: {
    hp: 100, radius: 34, coreR: 15, speed: 5, turn: 0.45, vineLen: 118, vineR: [3.8, 2.4],
    core: [0, 40, 23.5], mouth: [0, 75, 44], chest: 45,
    vines: [[24, 48, -8], [-24, 48, -8], [30, 40, 8], [-30, 40, 8], [18, 60, 16], [-18, 60, 16], [34, 30, -14], [-34, 30, -14]]
      .map(([x, h, y]) => ({ root: [x, h, -y], dir: [Math.sign(x) * 0.9, 0.55, -y / 30] })),
    attackEvery: 2.0, hitDamage: 3, grabDps: 1.4, grabChance: 0.25,
    acidEvery: 8, acidDur: 2.0, acidDps: 2.2, acidRange: 340,
    dmg: { beam: 5, core: 2.2, claw: 5, tail: 8, pulse: 8, vine: 3 },
  },
};
const VINE_HP = 25, REGROW = 15;
const RISE_T = 6, BURN_T = 4, SPORE_T = 5, EMERGE_T = 6, DIE_T = 7;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
const ease = t => t * t * (3 - 2 * t);

function bezier(out, p0, p1, p2, p3, t) {
  const u = 1 - t;
  return out.copy(p0).multiplyScalar(u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
}

// Abstand eines Punktes zur Strecke a-b
function segDist(p, a, b) {
  const ab = _d.subVectors(b, a), t = THREE.MathUtils.clamp(_c.subVectors(p, a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
  return _c.copy(a).addScaledVector(ab, t).distanceTo(p);
}

class Vine {
  constructor(scene, head, mat, len, r0, r1) {
    this.len = len;
    const l = len / SEG;
    const geo = new THREE.CylinderGeometry(r1, r0, len, 8, SEG * 3, true).translate(0, len / 2, 0);
    const pos = geo.attributes.position, n = pos.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i) / l, b = Math.min(SEG - 1, Math.floor(y)), f = y - b;
      si[i * 4] = b; si[i * 4 + 1] = b + 1; sw[i * 4] = 1 - f; sw[i * 4 + 1] = f;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
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
    this.bones[SEG].add(head);
    scene.add(this.mesh);
    this.pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.qw = Array.from({ length: SEG + 1 }, () => new THREE.Quaternion());
    this.tip = new THREE.Vector3();          // Weltposition der Spitze (Kopf)
    this.target = { mesh: { position: this.tip }, hp: VINE_HP };   // für die Zielerfassung des Strahls
    this.state = 'idle';
    this.t = 0;
    this.grow = 1;
    this.phase = Math.random() * 10;
  }

  // Kette an der Kurve root -> tip ausrichten; c1/c2 sind die Bezier-Kontrollpunkte, aim die Blickrichtung des Kopfes
  pose(root, c1, c2, tip, aim) {
    const l = this.len / SEG * this.grow, P = this.pts;
    P[0].copy(root);
    for (let i = 1; i <= SEG; i++) {
      bezier(_a, root, c1, c2, tip, i / SEG);
      _b.subVectors(_a, P[i - 1]).normalize();
      P[i].copy(P[i - 1]).addScaledVector(_b, l);
      this.qw[i - 1].setFromUnitVectors(Y, _b);
    }
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
    this.events.emit('biollanteRise', { form: 'rose' });
  }

  setForm(form) {
    for (const v of this.vines[this.form]) v.visible = false;
    this.form = form;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === form;
    for (const v of this.vines[form]) { v.visible = true; v.state = 'idle'; v.grow = 1; v.target.hp = VINE_HP; v.head.visible = true; }
    this.hp = this.F.hp;
    this.attackT = 3;
    this.acidT = this.F.acidEvery * 0.6;
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
    if (t < 0 || q > R * R) return max;
    return Math.min(max, t - Math.sqrt(R * R - q));
  }

  update(dt, g) {
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
          this.events.emit('biollanteRise', { form: 'beast' });
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
          this.events.emit('biollanteGone', {});
        }
        break;
      }
    }
    this.updateVines(dt, g);
    this.updateAcid(dt, g);
    // Godzilla kann nicht durch sie hindurchlaufen
    const minD = F.radius + 16;
    if (this.state !== 'dying' && dist < minD && dist > 0.01) { gp.x = G.position.x + dx / dist * minD; gp.z = G.position.z + dz / dist * minD; }
  }

  fight(dt, g, dist) {
    const F = this.F, G = this.group;
    // Bestie kriecht auf Godzilla zu und walzt Gebäude nieder
    if (F.speed && dist > F.radius + 70) {
      const k = F.speed * dt / dist;
      G.position.x += (g.position.x - G.position.x) * k;
      G.position.z += (g.position.z - G.position.z) * k;
      if (this.city) this.city.crush(_a.copy(G.position), F.radius + 12, dt);
    }
    if (F.speed && Math.random() < dt * 1.5) this.events.emit('shake', 0.15);
    // Rankenangriff: eine freie Ranke holt aus und schlägt zu
    if ((this.attackT -= dt) <= 0) {
      this.attackT = F.attackEvery * (0.7 + 0.6 * Math.random());
      const free = this.vines[this.form].filter(v => v.state === 'idle' && v.grow > 0.95);
      const reach = free.filter(v => v.tip.distanceTo(_a.copy(g.position).setY(45)) < v.len * 1.25);
      const v = reach[Math.floor(Math.random() * reach.length)];
      if (v) { v.state = 'wind'; v.t = 0; v.windTip = v.tip.clone(); }
    }
    // ätzender Saft aus Rose bzw. Maul
    if ((this.acidT -= dt) <= 0 && dist < F.acidRange) {
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
      if (v.state !== 'strike' && v.state !== 'grab') {
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
    for (const v of this.vines[this.form]) if (v.state === 'grab') v.state = 'retract';
    if (this.form === 'rose') { this.enter('burn'); this.events.emit('biollanteBurn', {}); }
    else { this.enter('dying'); this.dead = true; this.events.emit('biollanteDown', {}); }
  }

  get label() { return this.form === 'rose' ? 'BIOLLANTE – ROSE' : 'BIOLLANTE'; }
}
