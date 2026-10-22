// Militär der Selbstverteidigungsstreitkräfte: Panzer Typ 74, Raketen-LKW und AH-1 rücken in Wellen an, fahren auf den
// Straßen in Schussposition und feuern auf Godzilla. Godzilla zerstört sie mit allen Angriffen oder zertritt sie.
import * as THREE from 'three';

const P = 136;                          // Straßenraster der Stadt (city.js): Straßen liegen auf (i + 0,5) · P
const LAND_Z = 7.5 * P - P;             // nördlich davon Land (Bucht beginnt bei 7,5 P)
const SCALE = 1.4;                      // etwas größer als echt, damit man sie aus der Kamerahöhe noch erkennt
const MAX_UNITS = 14;

const TYPES = {
  tank: { model: 'U_tank', hp: 30, speed: 12, range: [170, 300], reload: 3.4, weapon: 'shell' },
  truck: { model: 'U_truck', hp: 25, speed: 16, range: [220, 340], reload: 7.5, weapon: 'missiles' },
  heli: { model: 'U_heli', hp: 18, speed: 34, range: [140, 220], reload: 4.0, weapon: 'rockets', air: true },
};
const WEAPONS = {
  shell: { speed: 320, damage: 1.3, size: 1.6, color: 0xffc070, homing: 0, trail: false },
  missile: { speed: 130, damage: 1.7, size: 2.2, color: 0xffe0b0, homing: 1.4, trail: true },
  rocket: { speed: 170, damage: 0.9, size: 1.6, color: 0xffd090, homing: 0.4, trail: true },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const road = v => (Math.round(v / P - 0.5) + 0.5) * P;     // nächste Straße

export class Military {
  constructor(units, scene, fx, events) {
    this.scene = scene;
    this.fx = fx;
    this.events = events;
    this.models = {};
    for (const t of Object.values(TYPES)) this.models[t.model] = units.scene.getObjectByName(t.model);
    this.rotor = units.scene.getObjectByName('U_heli_rotor');
    this.units = [];
    this.wrecks = [];
    this.shots = [];
    this.destroyed = 0;
    // Geschosse: leuchtende Leuchtspur-Kästchen (ein InstancedMesh)
    this.tracer = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd8a0, toneMapped: false }), 160);
    this.tracer.count = 0;
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.flash = new THREE.PointLight(0xffa050, 0, 160, 1);
    scene.add(this.flash);
    this.flashT = 0;
  }

  // ---------- Erzeugen ----------
  spawn(type, gz) {
    if (this.units.length >= MAX_UNITS) return null;
    const T = TYPES[type];
    const mesh = this.models[T.model].clone();
    mesh.scale.setScalar(SCALE);
    mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
    const u = { type, T, mesh, hp: T.hp, reload: 1 + Math.random() * T.reload, path: [], heading: 0, burst: 0, t: 0 };
    // Bodentruppen kommen an einer Kreuzung 380–520 m von Godzilla entfernt an, Hubschrauber von weiter außen
    const a = Math.random() * Math.PI * 2, d = T.air ? 650 : 380 + Math.random() * 140;
    let x = gz.x + Math.cos(a) * d, z = gz.z + Math.sin(a) * d;
    x = THREE.MathUtils.clamp(x, -9.5 * P, 9.5 * P);
    z = THREE.MathUtils.clamp(z, -9.5 * P, LAND_Z);
    mesh.add(this.lights(T.air));
    if (T.air) {
      mesh.position.set(x, 45 + Math.random() * 15, z);
      u.rotor = this.rotor.clone();
      u.rotor.position.set(0, 3.5, 0.8);              // Rotormast (Blender y −0,8 → glTF z +0,8)
      mesh.add(u.rotor);
      u.orbit = (Math.random() < 0.5 ? 1 : -1) * (0.09 + Math.random() * 0.07);
    } else {
      mesh.position.set(road(x), 0, road(z));
    }
    this.scene.add(mesh);
    this.units.push(u);
    return u;
  }

  // Nachts erkennt man die Fahrzeuge an ihren Lichtern: Scheinwerfer mit Lichtkegel auf der Straße, beim Hubschrauber
  // ein Suchscheinwerfer nach unten und ein rotes Blinklicht. Alles additiv, keine echten Lichtquellen.
  lights(air) {
    const L = this.lightKit ||= makeLightKit();
    const g = new THREE.Group();
    if (air) {
      const beam = new THREE.Mesh(L.cone, L.coneMat);
      beam.position.set(0, -1, 2); beam.rotation.x = -0.64;            // Kegel zeigt schräg nach vorn unten
      const blink = new THREE.Mesh(L.dot, L.red);
      blink.position.set(0, 1.6, 5);
      blink.userData.blink = true;
      g.add(beam, blink);
    } else {
      for (const x of [-0.9, 0.9]) {
        const h = new THREE.Mesh(L.dot, L.white);
        h.position.set(x, 1.2, 4.6);                          // vorn = +Z
        g.add(h);
      }
      const pool = new THREE.Mesh(L.pool, L.poolMat);
      pool.position.set(0, 0.15, 16); pool.scale.set(14, 1, 30);
      g.add(pool);
    }
    return g;
  }

  // ---------- Wellen: alle paar Sekunden Verstärkung, je länger Godzilla wütet, desto mehr und gemischter ----------
  updateWaves(dt, gz, rage) {
    this.waveT = (this.waveT ?? 6) - dt;
    if (this.waveT > 0) return;
    this.wave = (this.wave || 0) + 1;
    const w = this.wave + Math.floor(rage / 25);              // Zerstörung treibt die Eskalation
    this.waveT = Math.max(9, 22 - w);
    const plan = ['tank', 'tank'];
    if (w >= 2) plan.push('truck');
    if (w >= 3) plan.push('heli');
    if (w >= 4) plan.push('tank', 'truck');
    if (w >= 6) plan.push('heli', 'tank');
    if (w >= 8) plan.push('truck', 'heli');
    for (const t of plan) this.spawn(t, gz);
    this.events.emit('wave', { n: this.wave });
  }

  // ---------- Fahren: L-förmig über das Straßenraster zu einer Kreuzung in Schussweite ----------
  plan(u, gz) {
    const [lo, hi] = u.T.range;
    const p = u.mesh.position;
    const a = Math.atan2(p.z - gz.z, p.x - gz.x) + (Math.random() - 0.5) * 0.8;
    const d = lo + Math.random() * (hi - lo);
    const tx = road(THREE.MathUtils.clamp(gz.x + Math.cos(a) * d, -9.5 * P, 9.5 * P));
    const tz = road(THREE.MathUtils.clamp(gz.z + Math.sin(a) * d, -9.5 * P, LAND_Z));
    u.path = Math.random() < 0.5 ? [new THREE.Vector3(p.x, 0, tz), new THREE.Vector3(tx, 0, tz)]
      : [new THREE.Vector3(tx, 0, p.z), new THREE.Vector3(tx, 0, tz)];
  }

  update(dt, g, city) {
    const gz = g.position;
    for (const u of this.units) {
      u.t += dt;
      const p = u.mesh.position;
      const dist = Math.hypot(p.x - gz.x, p.z - gz.z);
      if (u.T.air) this.fly(u, dt, gz, dist);
      else this.drive(u, dt, gz, dist);
      // Feuern, wenn in Reichweite
      u.reload -= dt;
      if (u.reload <= 0 && dist < u.T.range[1] + 60 && (u.T.air || !u.path.length)) {
        u.reload = u.T.reload * (0.8 + Math.random() * 0.4);
        u.burst = u.T.weapon === 'missiles' ? 4 : u.T.weapon === 'rockets' ? 3 : 1;
      }
      if (u.burst > 0 && (u.burstT = (u.burstT || 0) - dt) <= 0) {
        u.burst--;
        u.burstT = 0.22;
        this.fire(u, g);
      }
      // Godzilla tritt auf Bodentruppen, die ihm zu nahe kommen
      if (!u.T.air && dist < 16) this.hit(u, 999, gz);
    }
    this.units = this.units.filter(u => u.hp > 0);
    this.updateShots(dt, g);
    this.updateWrecks(dt);
    this.flashT -= dt;
    this.flash.intensity = Math.max(0, this.flashT) * 1500;
  }

  drive(u, dt, gz, dist) {
    const p = u.mesh.position;
    // zu nah oder zu weit weg: neue Schussposition suchen
    if (!u.path.length && (dist < u.T.range[0] - 50 || dist > u.T.range[1] + 80)) this.plan(u, gz);
    if (u.path.length) {
      const target = u.path[0];
      _v.subVectors(target, p).setY(0);
      const d = _v.length();
      if (d < 1) { u.path.shift(); return; }
      const step = Math.min(d, u.T.speed * dt);
      p.addScaledVector(_v.normalize(), step);
      this.turn(u, Math.atan2(_v.x, _v.z), dt, 2.5);
    } else {
      this.turn(u, Math.atan2(gz.x - p.x, gz.z - p.z), dt, 1.2);   // zum Ziel drehen
    }
  }

  fly(u, dt, gz, dist) {
    const p = u.mesh.position;
    const [lo, hi] = u.T.range;
    const want = (lo + hi) / 2;
    // kreisen um Godzilla, dabei den Abstand halten
    const a = Math.atan2(p.z - gz.z, p.x - gz.x) + u.orbit * dt;
    const r = dist + THREE.MathUtils.clamp(want - dist, -u.T.speed * dt, u.T.speed * dt);
    const nx = gz.x + Math.cos(a) * r, nz = gz.z + Math.sin(a) * r;
    p.x = nx; p.z = nz;
    p.y += (50 + 6 * Math.sin(u.t * 0.7) - p.y) * dt;
    this.turn(u, Math.atan2(gz.x - p.x, gz.z - p.z), dt, 2);
    u.mesh.rotation.x = 0.12;                                       // Nase leicht nach unten
    u.rotor.rotation.y += dt * 40;
    u.mesh.traverse(o => { if (o.userData.blink) o.visible = (u.t * 1.5) % 1 < 0.2; });
  }

  turn(u, target, dt, rate) {
    const d = Math.atan2(Math.sin(target - u.heading), Math.cos(target - u.heading));
    u.heading += Math.max(-rate * dt, Math.min(rate * dt, d));
    // die Modelle schauen nach -Y in Blender = +Z im glTF
    u.mesh.rotation.y = u.heading;
  }

  // ---------- Schießen ----------
  fire(u, g) {
    const W = WEAPONS[u.T.weapon === 'missiles' ? 'missile' : u.T.weapon === 'rockets' ? 'rocket' : 'shell'];
    const from = u.mesh.position.clone();
    from.y += u.T.air ? -1 : u.T.weapon === 'missiles' ? 4 : 3.5;
    from.x += Math.sin(u.heading) * 6; from.z += Math.cos(u.heading) * 6;
    // Ziel: irgendwo am Rumpf, so gestreut, dass etwa die Hälfte danebengeht und in der Stadt einschlägt
    const aim = g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 44, 20 + Math.random() * 45, (Math.random() - 0.5) * 44));
    const vel = aim.sub(from).normalize().multiplyScalar(W.speed);
    if (u.T.weapon === 'missiles') vel.y += 40;                    // Raketen steigen erst auf
    this.shots.push({ pos: from, vel, W, life: 4 });
    this.events.emit('shot', { pos: from });
    this.fx.fire.emit(from.x, from.y, from.z, 3, { spread: 1.5, up: 2, out: 3, size: 5, life: 0.25 });   // Mündungsfeuer
    this.fx.dust.emit(from.x, from.y, from.z, 1, { spread: 2, up: 1, out: 2, size: 6, life: 1.5, color: [0.25, 0.24, 0.23] });
  }

  updateShots(dt, g) {
    const gz = g.position;
    let n = 0;
    this.shots = this.shots.filter(s => {
      s.life -= dt;
      if (s.W.homing) {                                          // Lenkflugkörper drehen auf Godzilla ein
        _v.set(gz.x, 45, gz.z).sub(s.pos).normalize().multiplyScalar(s.W.speed);
        s.vel.lerp(_v, Math.min(1, s.W.homing * dt));
      }
      s.pos.addScaledVector(s.vel, dt);
      if (s.W.trail && Math.random() < 0.7) this.fx.dust.emit(s.pos.x, s.pos.y, s.pos.z, 1, { spread: 0.5, up: 0.3, out: 0.5, size: 4, life: 1.6, color: [0.3, 0.3, 0.3] });
      // Treffer: Abstand zu einer Kapsel um Godzillas Rumpf (Füße bis Kopf)
      const dy = THREE.MathUtils.clamp(s.pos.y, 6, 72);
      const hit = Math.hypot(s.pos.x - gz.x, s.pos.z - gz.z, s.pos.y - dy) < 15;
      if (hit) {
        g.takeDamage(s.W.damage, s.pos);
        this.boom(s.pos, 0.4);
        return false;
      }
      if (s.life <= 0 || s.pos.y < 0) { if (s.pos.y < 0) this.boom(s.pos.setY(1), 0.3); return false; }
      if (n < this.tracer.instanceMatrix.count) {
        _q.setFromUnitVectors(_w.set(0, 0, 1), _v.copy(s.vel).normalize());
        this.tracer.setMatrixAt(n++, _m.compose(s.pos, _q, _s.set(s.W.size * 0.5, s.W.size * 0.5, s.W.size * 3)));
      }
      return true;
    });
    this.tracer.count = n;
    this.tracer.instanceMatrix.needsUpdate = true;
  }

  // ---------- Treffer an Einheiten (von Godzillas Angriffen) ----------
  damage(pos, radius, amount, from) {
    let n = 0;
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const p = u.mesh.position;
      if (Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z) > radius + 6) continue;
      this.hit(u, amount, from);
      n++;
    }
    return n;
  }

  // Atomstrahl: alles nahe der Strahllinie (auch Hubschrauber in der Luft)
  damageLine(from, to, radius, amount) {
    const ab = _w.subVectors(to, from), len2 = ab.lengthSq();
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const t = THREE.MathUtils.clamp(_v.subVectors(u.mesh.position, from).dot(ab) / len2, 0, 1);
      if (_v.copy(from).addScaledVector(ab, t).distanceTo(u.mesh.position) < radius) this.hit(u, amount, from);
    }
  }

  hit(u, amount, from) {
    if (u.hp <= 0) return;
    u.hp -= amount;
    if (u.hp > 0) return;
    this.destroyed++;
    this.scene.remove(u.mesh);
    const p = u.mesh.position;
    this.boom(p, u.T.air ? 1.2 : 1);
    this.events.emit('unitDestroyed', { type: u.type, pos: p.clone() });
    // Wrack: verkohltes Modell bleibt eine Weile liegen und raucht; Hubschrauber stürzen ab
    const wreck = u.mesh.clone(true);
    wreck.traverse(o => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.18); o.material.emissive?.setRGB(0, 0, 0); }
    });
    if (u.rotor) wreck.remove(wreck.children.find(c => c.name === u.rotor.name));
    wreck.rotation.z = (Math.random() - 0.5) * 0.6;
    this.scene.add(wreck);
    this.wrecks.push({ mesh: wreck, t: 0, vy: 0, air: !!u.T.air, spin: (Math.random() - 0.5) * 4 });
  }

  boom(pos, k) {
    this.fx.fire.emit(pos.x, pos.y, pos.z, Math.round(10 * k), { spread: 3 * k, up: 6 * k, out: 7 * k, size: 9 * k, life: 0.8 });
    this.fx.dust.emit(pos.x, pos.y, pos.z, Math.round(4 * k), { spread: 3 * k, up: 4, out: 4, size: 12 * k, life: 3, color: [0.12, 0.11, 0.1] });
    if (k >= 1) this.fx.debris.emit(pos, 3, { speed: 14, size: 1 });
    this.flash.position.copy(pos).setY(pos.y + 5);
    this.flashT = Math.max(this.flashT, 0.18 * k);
  }

  updateWrecks(dt) {
    this.wrecks = this.wrecks.filter(w => {
      w.t += dt;
      const p = w.mesh.position;
      if (w.air && p.y > 1) {                                    // Absturz mit Trudeln
        w.vy -= 20 * dt; p.y = Math.max(1, p.y + w.vy * dt); w.mesh.rotation.y += w.spin * dt;
        if (p.y <= 1) this.boom(p, 0.8);
      }
      if (Math.random() < dt * 2) this.fx.dust.emit(p.x, p.y + 2, p.z, 1, { spread: 2, up: 4, out: 1, size: 8, life: 4, color: [0.07, 0.07, 0.07] });
      if (w.t > 25) { this.scene.remove(w.mesh); return false; }
      return true;
    });
  }

  // Alle Einheiten (Zielerfassung des Atomstrahls: nutzt mesh.position und hp)
  targets() { return this.units; }

  // Alles entfernen (neues Spiel)
  clear() {
    for (const u of this.units) this.scene.remove(u.mesh);
    for (const w of this.wrecks) this.scene.remove(w.mesh);
    this.units = []; this.wrecks = []; this.shots = []; this.wave = 0; this.waveT = 6;
  }
}

// Gemeinsame Geometrien und Materialien für die Fahrzeuglichter
function makeLightKit() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const glow = new THREE.CanvasTexture(c);
  const add = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...opts });
  const cone = new THREE.ConeGeometry(9, 60, 16, 1, true);
  cone.translate(0, -30, 0);                         // Spitze am Lampenkopf
  const coneMat = add({ color: 0x9fb4d0, opacity: 0.22, side: THREE.DoubleSide });
  return {
    dot: new THREE.SphereGeometry(0.9, 8, 6),
    white: new THREE.MeshBasicMaterial({ color: 0xfff2d8, toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }),
    pool: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    poolMat: add({ map: glow, opacity: 0.9, color: 0xffe6c0 }),
    cone, coneMat,
  };
}
