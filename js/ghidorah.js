// 1991: King Ghidorah (Boss) und Mecha-King Ghidorah (Endgegner), nach Filmbildern des Nutzers.
// Rumpf, Flügel, Köpfe und Schwanzenden kommen aus ghidorah.glb; Hälse und Schwänze sind Ketten (chain.js).
// - Gravitationsstrahlen sind zuckende Blitze (gelb-orange, beim Mecha-Kopf bläulich), die umherirren und Godzilla nur
//   ab und zu treffen; daneben schlagen sie in Boden und Gebäude ein.
// - Je mehr Schaden, desto mehr Löcher in den Flügeln (Shader verwirft Kreise im Flügel, Rand verkohlt und glüht).
// - King Ghidorah fliegt, landet ab und zu (dann erreichbar für Klaue und Schwanz). Am Boden packen die äußeren Köpfe
//   Godzillas Schultern und der mittlere feuert aus nächster Nähe; nur der Kernpuls befreit.
// - Mecha-King Ghidorah ist gepanzert, schießt Greifhaken an Seilen, die Godzilla festhalten; nur der Kernpuls befreit.
import * as THREE from 'three';
import { Chain, ease } from './chain.js';
import { Lightning } from './effects.js';

// Gelenkpunkte aus blender/ghidorah.py, umgerechnet nach glTF (x, z, -y)
const NECK_ROOTS = [[0, 67, 5], [8.5, 64, 2.5], [-8.5, 64, 2.5]];
const TAIL_ROOTS = [[3.2, 31, -11], [-3.2, 31, -11]];
const WING_ROOT = [7.5, 63, -7];
const SCALE = 1.1;
const CHEST = 52 * SCALE, RADIUS = 24;
const NECK_LEN = 44, TAIL_LEN = 76;
const MAX_HOLES = 8;

const KINDS = {
  king: {
    hp: 100, alt: 78, range: [150, 210], beamEvery: 2.6, beamDur: 2.0, beamDps: 4.2, trioEvery: 12, wander: 30,
    landEvery: 20, landDur: 11, grabEvery: 14, grabDps: 3.0, grabMax: 6, grabRange: 120,
    dmg: { beam: 4, head: 6, claw: 4, tail: 6, pulse: 8, free: 6 },
    colors: [[1.0, 0.72, 0.18], [1.0, 0.72, 0.18], [1.0, 0.72, 0.18]],
  },
  mecha: {
    hp: 100, alt: 70, range: [140, 200], beamEvery: 2.3, beamDur: 2.0, beamDps: 4.2, trioEvery: 10, wander: 24,
    landEvery: 26, landDur: 9, grabEvery: 18, grabDps: 2.4, grabMax: 8, grabRange: 230,
    dmg: { beam: 2.5, head: 4, claw: 3, tail: 4.5, pulse: 6, free: 8 },
    colors: [[0.35, 0.6, 1.0], [1.0, 0.72, 0.18], [1.0, 0.72, 0.18]],
  },
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// Flügelmaterial mit Löchern: uHoles[i] = (Mitte im Flügel-Modell, Radius); Rand gezackt, verkohlt, glühend
function holeMaterial(src) {
  const m = src.clone();
  const holes = Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0));
  m.userData.holes = holes;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = sh => {
    sh.uniforms.uHoles = { value: holes };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLocalPos;\nuniform vec4 uHoles[${MAX_HOLES}];`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float holeBurn = 0.0;
        for (int i = 0; i < ${MAX_HOLES}; i++) {
          if (uHoles[i].w <= 0.0) continue;
          vec3 q = vLocalPos - uHoles[i].xyz;
          float rag = 0.22 * sin(q.x * 0.9 + q.z * 1.3) + 0.14 * sin(q.y * 1.7 - q.x * 0.6) + 0.1 * sin(q.z * 2.9);
          float d = length(q) / uHoles[i].w + rag;
          if (d < 1.0) discard;
          holeBurn = max(holeBurn, 1.0 - smoothstep(1.0, 1.4, d));
        }
        diffuseColor.rgb *= 1.0 - 0.85 * holeBurn;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.35, 0.05) * holeBurn * (0.6 + 0.4 * sin(vLocalPos.x * 0.5));`);
  };
  m.customProgramCacheKey = () => 'gh-holes';
  return m;
}

class GhidorahBase {
  constructor(gltf, scene, fx, events, military, kind) {
    this.scene = scene;
    this.fx = fx;
    this.events = events;
    this.military = military;
    this.kind = kind;
    this.K = KINDS[kind];
    const mecha = this.mecha = kind === 'mecha';
    const get = n => gltf.scene.getObjectByName(n);
    // leichter Eigenschimmer, damit Gold und Chrom nachts nicht zur Silhouette werden (Materialien sind geteilt)
    gltf.scene.traverse(o => {
      if (o.isMesh && /GH_Scale|GH_Membrane|MGH_Chrome|GH_Horn/.test(o.material.name) && !o.material.userData.glow) {
        o.material.userData.glow = true;
        o.material.emissive.setRGB(...(/MGH/.test(o.material.name) ? [0.05, 0.05, 0.06] : [0.09, 0.06, 0.01]));
      }
    });
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.scale.setScalar(SCALE);
    scene.add(this.group);
    this.mesh = this.group;                       // Mini-Map und Schrei-Ziel lesen mesh.position
    const body = get(mecha ? 'MGH_body' : 'GH_body').clone();
    body.position.set(0, 0, 0);
    this.group.add(body);
    let skin = null;
    body.traverse(o => { if (o.isMesh && !skin && /GH_Scale/.test(o.material.name)) skin = o.material; });
    // Flügel: Gelenk an der Schulter, der rechte gespiegelt; jede Membran bekommt ein eigenes Material für Löcher
    this.wingSkins = [];
    this.wings = [1, -1].map(sx => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * WING_ROOT[0], WING_ROOT[1], WING_ROOT[2]);
      const w = get(mecha ? 'MGH_wing' : 'GH_wing').clone();
      w.position.set(0, 0, 0);
      w.scale.set(sx, 1, 1);
      w.traverse(o => {
        if (o.isMesh && /Membrane|MGH_Mesh/.test(o.material.name)) {
          o.material = holeMaterial(o.material);
          this.wingSkins.push(o);
        }
      });
      pivot.add(w);
      this.group.add(pivot);
      pivot.userData.sx = sx;
      return pivot;
    });
    // Hälse mit Köpfen (Mecha: silberner, gegliederter Mittelhals mit Mechanik-Kopf), Schwänze mit Stachelbüschel
    // bzw. Greifzange
    const gold = [0.75, 0.5, 0.12], silver = [0.55, 0.55, 0.58];
    this.necks = NECK_ROOTS.map((r, i) => {
      const mech = mecha && i === 0;
      const c = new Chain(scene, skin, NECK_LEN * SCALE, 4.8 * SCALE, 3.3 * SCALE, { color: mech ? silver : gold, rings: mech ? 22 : 12 });
      c.visible = false;
      c.root = new THREE.Vector3(...r);
      c.side = i === 0 ? 0 : (r[0] > 0 ? 1 : -1);
      c.head = get(mech ? 'MGH_head' : 'GH_head').clone();
      c.head.scale.setScalar(SCALE);
      c.head.visible = false;
      scene.add(c.head);
      c.mouth = new THREE.Vector3();
      c.target = { mesh: { position: c.mouth }, hp: 1 };
      return c;
    });
    this.tails = TAIL_ROOTS.map(r => {
      const tip = get(mecha ? 'MGH_clamp' : 'GH_tailtip').clone();
      tip.position.set(0, 0, 0);
      const c = new Chain(scene, skin, TAIL_LEN * SCALE, 4.6 * SCALE, 1.1 * SCALE, { color: gold, rings: 22, head: tip });
      c.visible = false;
      c.root = new THREE.Vector3(...r);
      return c;
    });
    this.bolts = this.necks.map((n, i) => { const b = new Lightning(scene, this.K.colors[i]); b.t = 0; b.wanderPh = i * 2.1; return b; });
    this.bodyTarget = { mesh: { position: new THREE.Vector3() }, hp: 1 };
    this.active = false;
    this.dead = false;
    this.hp = this.K.hp;
    this.t = 0;
    this.holes = 0;
  }

  get label() { return this.mecha ? 'MECHA-KING GHIDORAH' : 'KING GHIDORAH'; }

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
    this.grabT = this.K.grabEvery;
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
    this.g = g;
    this.t += dt;
    this.st += dt;
    const G = this.group, p = G.position, gp = g.position, K = this.K;
    const dx = gp.x - p.x, dz = gp.z - p.z, dist = Math.hypot(dx, dz);
    if (this.dead) { this.crash(dt); this.updateParts(dt, g); return; }
    // Flug: kreist in Strahlweite, landet ab und zu vor Godzilla
    let alt = K.alt + 6 * Math.sin(this.t * 0.7), want = (K.range[0] + K.range[1]) / 2 + 20 * Math.sin(this.t * 0.25);
    if (this.state === 'arrive') {
      alt = 120; want = K.range[1];
      if (dist < K.range[1] + 60) { this.state = 'fly'; this.st = 0; this.events.emit('ghidorahArrive', {}); }
    } else if (this.state === 'fly' && (this.landT -= dt) <= 0) { this.state = 'land'; this.st = 0; }
    if (this.state === 'land') {
      alt = 0; want = this.hold ? 60 : 68;                      // nah genug für Klaue und Schwanz
      if (this.st > K.landDur && !this.hold) { this.state = 'fly'; this.st = 0; this.landT = K.landEvery * (0.8 + 0.4 * Math.random()); }
    }
    if (this.hold && this.mecha) { alt = 45; want = 85; }
    const speed = this.state === 'arrive' ? 70 : 32;
    const ang = Math.atan2(p.z - gp.z, p.x - gp.x) + (this.state === 'land' || this.hold ? 0 : 0.05 * dt);
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
    let dy = Math.atan2(dx, dz) - G.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    G.rotation.y += THREE.MathUtils.clamp(dy, -1.2 * dt, 1.2 * dt);
    G.rotation.x = this.state === 'land' ? 0 : 0.12;          // im Flug leicht nach vorn geneigt
    G.updateMatrixWorld(true);
    this.bodyTarget.mesh.position.set(p.x, p.y + CHEST, p.z);
    this.attacks(dt, g, dist);
    this.updateHold(dt, g, dist);
    this.updateParts(dt, g);
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
    if (this.state === 'arrive' || g.state === 'dead' || this.hold) return;
    if ((this.beamT -= dt) <= 0 && dist < 420) {
      this.beamT = K.beamEvery * (0.8 + 0.4 * Math.random());
      const free = this.bolts.filter(b => b.t <= 0);
      const b = free[Math.floor(Math.random() * free.length)];
      if (b) { b.t = K.beamDur; this.events.emit('gravityBeam', {}); }
    }
    if ((this.trioT -= dt) <= 0 && dist < 380) {
      this.trioT = K.trioEvery * (0.8 + 0.4 * Math.random());
      for (const b of this.bolts) b.t = K.beamDur * 1.3;
      this.events.emit('gravityBeam', { all: true });
    }
  }

  // Griff: King Ghidorah packt mit den äußeren Köpfen zu (nur gelandet), Mecha schießt Greifhaken
  updateHold(dt, g, dist) {
    const K = this.K;
    if (!this.hold) {
      const can = this.mecha ? this.state === 'fly' : this.state === 'land' && this.group.position.y < 4;
      if (can && (this.grabT -= dt) <= 0 && dist < K.grabRange && g.state !== 'dead') {
        this.hold = { t: 0 };
        g.held = 'vines';
        for (const b of this.bolts) b.t = 0;
        if (!this.mecha) this.bolts[0].t = K.grabMax + 1;          // der Mittelkopf feuert aus nächster Nähe
        this.events.emit('grabStart', { kind: this.mecha ? 'hooks' : 'heads' });
      }
      return;
    }
    const h = this.hold;
    h.t += dt;
    g.speedCap = 0;
    g.takeDamage(K.grabDps * dt * (this.mecha ? 1 : 0.4), g.position);   // King: der Strahl des Mittelkopfs trifft zusätzlich
    g.hurt = 0;
    if (Math.random() < dt * 3) this.events.emit('shake', 0.25);
    if (h.t > K.grabMax) this.release(g, 'timeout');
  }

  release(g, how) {
    if (!this.hold) return;
    this.hold = null;
    if (g) { g.held = null; g.speedCap = Infinity; }
    this.bolts[0].t = 0;
    this.grabT = this.K.grabEvery * (0.8 + 0.4 * Math.random());
    this.events.emit('holdFree', { kind: 'grab', how });
    if (how === 'pulse') { this.damage(this.K.dmg.free, true); this.military.boom(this.bodyTarget.mesh.position, 1.0); }
  }

  // Hälse, Köpfe, Schwänze, Flügel und Blitze
  updateParts(dt, g) {
    const G = this.group, M = G.matrixWorld, grounded = G.position.y < 6 && !this.dead;
    const chest = _c.copy(g.position).setY(50);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(G.quaternion).setY(0).normalize();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const gRight = new THREE.Vector3(Math.cos(g.heading), 0, -Math.sin(g.heading));
    // Flügel: King schlägt im Flug kräftig, am Boden halb angelegt; die Mecha-Flügel stehen fast still
    const flap = this.mecha ? 0.2 + 0.06 * Math.sin(this.t * 1.2)
      : grounded ? 0.35 + 0.08 * Math.sin(this.t * 1.5) : 0.15 + 0.62 * Math.sin(this.t * (this.dead ? 9 : 3.4));
    for (const w of this.wings) w.rotation.set(0, w.userData.sx * -0.35, w.userData.sx * flap);
    const kingHold = this.hold && !this.mecha;
    this.necks.forEach((n, i) => {
      const root = n.root.clone().applyMatrix4(M);
      const L = n.len, ph = n.phase + this.t;
      // jeder Hals für sich: eigene Frequenzen, schnelles Schlängeln und ruckartige Blickwechsel (wie ein nervöses Tier)
      n.f ??= [1.6 + Math.random(), 2.1 + Math.random() * 1.4, 1.3 + Math.random()];
      if ((n.dartT = (n.dartT ?? 0) - dt) <= 0) {
        n.dartT = 0.35 + Math.random() * 0.9;
        n.dart = new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.4) * 14, (Math.random() - 0.5) * 22);
      }
      const sway = new THREE.Vector3(Math.sin(ph * n.f[0]) * 7, Math.sin(ph * n.f[1]) * 4, Math.cos(ph * n.f[2]) * 7).add(n.dart);
      let tip = root.clone().addScaledVector(fwd, L * 0.3).addScaledVector(right, n.side * L * 0.42).addScaledVector(UP, L * 0.68).add(sway);
      if (this.bolts[i].t > 0) tip.addScaledVector(fwd, L * 0.15);
      let aim = chest.clone().sub(tip);
      if (kingHold && n.side) {                     // äußere Köpfe beißen in Godzillas Schultern
        const at = g.position.clone().addScaledVector(gRight, -n.side * 11).setY(60);
        tip.lerp(at, ease(Math.min(1, this.hold.t / 0.4)));
        aim = at.clone().sub(root);
      }
      if (this.dead) tip.addScaledVector(UP, -L * 0.9);
      const c1 = root.clone().addScaledVector(UP, L * 0.35).addScaledVector(right, n.side * L * 0.12);
      const c2 = tip.clone().addScaledVector(fwd, -L * 0.3).addScaledVector(UP, L * 0.1);
      n.smooth ??= tip.clone();
      n.smooth.lerp(tip, 1 - Math.exp(-(kingHold ? 8 : 7) * dt));
      aim.normalize();
      n.pose(root, c1, c2, n.smooth, aim);
      n.head.position.copy(n.tip);
      n.head.up.set(0, 1, 0);
      n.head.lookAt(_a.copy(n.tip).addScaledVector(aim, 10));
      n.mouth.copy(n.tip).addScaledVector(aim, 16 * SCALE);
      this.updateBolt(dt, g, i, n.mouth, chest, kingHold && i === 0);
    });
    // Schwänze: im Flug hängen sie nach hinten unten und schwingen, am Boden liegen sie hinter dem Körper
    this.tails.forEach((c, i) => {
      const root = c.root.clone().applyMatrix4(M);
      const L = c.len, side = i ? -1 : 1, ph = c.phase + this.t;
      const tip = root.clone().addScaledVector(fwd, -L * 0.72).addScaledVector(right, side * L * 0.28 + Math.sin(ph) * 10);
      tip.y = grounded ? 3 : root.y - L * 0.55 + Math.sin(ph * 1.3) * 6;
      const c1 = root.clone().addScaledVector(fwd, -L * 0.3).addScaledVector(UP, -L * 0.1);
      const c2 = tip.clone().addScaledVector(fwd, L * 0.2).setY(grounded ? 3 : tip.y + L * 0.15);
      c.pose(root, c1, c2, tip, tip.clone().sub(c2));
    });
  }

  // Blitz eines Kopfes: irrt um Godzilla herum (trifft nur ab und zu), Gebäude dazwischen fangen ihn ab; beim
  // Festhalten trifft der Mittelkopf genau
  updateBolt(dt, g, i, from, chest, sure) {
    const b = this.bolts[i];
    if (b.t <= 0 || this.dead || !this.camera) { b.update(dt, false); return; }
    b.t -= dt;
    const W = this.K.wander, ph = this.t + b.wanderPh;
    const aim = _b.copy(chest);
    if (!sure) aim.add(new THREE.Vector3(Math.sin(ph * 1.9) * W, Math.sin(ph * 2.7) * W * 0.7 - W * 0.35, Math.cos(ph * 1.5) * W));
    const dir = aim.clone().sub(from);
    let len = dir.length(); dir.normalize();
    if (dir.y < -1e-3 && from.y + dir.y * len < 0) len = from.y / -dir.y;          // bis zum Boden
    const hitB = this.city ? this.city.raycast(from, dir, len) : len;
    const end = from.clone().addScaledVector(dir, Math.min(len, hitB));
    b.update(dt, true, from, end, this.camera);
    const onG = Math.hypot(end.x - g.position.x, end.z - g.position.z) < 15 && end.y > 4 && end.y < 85;
    if (onG) { g.takeDamage(this.K.beamDps * dt, end); if (this.hold) g.hurt = 0; }   // festgehalten: kein Zucken, sonst ginge der Kernpuls nicht
    else if (this.city) this.city.damage(end, 12, 90 * dt, from, false, end.y);
    if (Math.random() < dt * (onG ? 16 : 10)) {
      this.fx.fire.emit(end.x, end.y, end.z, 2, { spread: 4, up: 6, out: 10, size: 10, life: 0.5 });
      if (!onG && end.y < 2) this.fx.dust.emit(end.x, 0, end.z, 2, { spread: 6, up: 4, out: 6, size: 16, life: 2 });
    }
  }

  // Ein neues Loch in einem der Flügel (abwechselnd), an einer zufälligen Stelle der Membran
  addHole() {
    const skins = this.wingSkins;
    if (!skins.length || this.holes >= MAX_HOLES * skins.length) return;
    const o = skins[this.holes % skins.length];
    const pos = o.geometry.attributes.position, k = Math.floor(Math.random() * pos.count);
    const slot = o.material.userData.holes.find(h => h.w <= 0);
    if (!slot) return;
    slot.set(pos.getX(k), pos.getY(k), pos.getZ(k), (this.mecha ? 6 : 7) + Math.random() * 6);
    this.holes++;
    const wp = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).applyMatrix4(o.matrixWorld);
    this.fx.fire.emit(wp.x, wp.y, wp.z, 6, { spread: 6, up: 3, out: 8, size: 14, life: 0.8 });
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
    const D = this.K.dmg;
    const head = this.necks.find(n => to.distanceTo(n.mouth) < 14 || to.distanceTo(n.tip) < 12);
    if (head) { this.damage(D.head * dt); return; }
    if (to.distanceTo(this.bodyTarget.mesh.position) < RADIUS + 8) this.damage(D.beam * dt);
  }

  damage(n, big) {
    if (!this.fighting()) return;
    const before = this.hp;
    this.hp = Math.max(0, this.hp - n);
    // alle 11 Lebenspunkte ein Loch mehr in den Flügeln
    for (let k = Math.floor((100 - before) / 11); k < Math.floor((100 - this.hp) / 11); k++) this.addHole();
    if (big) { this.military.boom(this.bodyTarget.mesh.position, 0.8); this.events.emit('bossHit', {}); }
    if (this.hp <= 0) this.down();
  }

  down() {
    this.dead = true;
    this.vy = 0;
    if (this.hold) this.release(this.g, 'timeout');
    for (const b of this.bolts) b.t = 0;
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
      for (const b of this.bolts) b.update(dt, false);
      this.onGone();
    }
  }

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
    super.update(dt, g);
  }

  onDown() { this.events.emit('bossDown', {}); }
  onGone() { this.events.emit('bossCrash', { pos: this.group.position.clone() }); }
  beamLine(from, to, dt) { super.beamLine(from, to, 220, dt); }
}

// ---------- Mecha-King Ghidorah: Endgegner (wie Biollante: start(gz, city), fighting(), finalRise ...) ----------
export class MechaKingGhidorah extends GhidorahBase {
  constructor(gltf, scene, fx, events, glow, military) {
    super(gltf, scene, fx, events, military, 'mecha');
    // Greifhaken: zwei Stahlseile vom Brustpanzer zu einer Klammer um Godzillas Brust
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.9, roughness: 0.3 });
    this.cables = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2), mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(15, 1.6, 6, 18).rotateX(Math.PI / 2), mat);
    this.ring.visible = false;
    scene.add(this.ring);
  }

  start(gz, city) {
    this.appear(gz, city);
    this.events.emit('finalRise', { title: 'MECHA-KING GHIDORAH' });
  }

  update(dt, g) {
    super.update(dt, g);
    const on = !!this.hold && this.fighting();
    this.ring.visible = on;
    this.cables.forEach((c, i) => {
      c.visible = on;
      if (!on) return;
      const to = _b.copy(g.position).setY(52).add(new THREE.Vector3(i ? -13 : 13, 0, 0).applyAxisAngle(UP, g.heading));
      const from = _a.set(i ? -6 : 6, 50, 14).applyMatrix4(this.group.matrixWorld);
      c.position.copy(from); c.lookAt(to); c.scale.set(1, 1, from.distanceTo(to));
    });
    if (on) { this.ring.position.copy(g.position).setY(52); this.ring.rotation.y = g.heading; }
  }

  onDown() { this.events.emit('finalDown', { title: 'MECHA-KING GHIDORAH STÜRZT AB' }); }
  onGone() { this.events.emit('finalGone', {}); this.ring.visible = false; for (const c of this.cables) c.visible = false; }
}
