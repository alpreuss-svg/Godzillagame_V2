// Bossphase Super-X (1984): schwebt in Strahlweite, beleuchtet Godzilla mit Suchscheinwerfern, feuert mit dem Bordgeschütz
// und alle paar Sekunden Kadmium-Raketen, die Godzilla zusammensacken lassen. Gegen den Atomstrahl gepanzert – wie im
// Film hilft nur ein Hochhaus, das auf sie stürzt (das city-Ereignis 'topple' liefert die Fall-Linie).
import * as THREE from 'three';
import { Beam } from './effects.js';

const SCALE = 1.7;
const ALT = 68;                    // Schwebehöhe: über Büros, unter den Hochhäusern
const ALT_TRAVEL = 172;            // Anflughöhe über allen Hochhäusern (sonst bleibt sie an ihnen hängen)
const RANGE = [130, 190];          // Abstand zu Godzilla
const HP = 100;
const TOPPLE_DAMAGE = 38;          // drei Hochhäuser holen sie herunter
const BEAM_DPS = 1.5;              // Panzerung: der Strahl kratzt nur
const CADMIUM_EVERY = 18;          // s; Kadmium nur, wenn Godzilla im Hochhausviertel ist
const GUN_EVERY = 2.0;
const SALVO_DAMAGE = 2;          // Raketen der Super-X2 (betäuben nicht)

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

export class SuperX {
  constructor(units, scene, fx, events, military, model = 'U_superx', lamp = [5.5, -1, 13]) {
    this.scene = scene;
    this.fx = fx;
    this.events = events;
    this.military = military;              // für Explosionen
    this.lamp = lamp;                      // Lage der Scheinwerfer im Modell (x gespiegelt)
    this.stun = true;                      // Kadmium betäubt; die Super-X2 feuert stattdessen normale Raketen
    this.salvoText = 'KADMIUM-RAKETEN!';
    this.mesh = units.scene.getObjectByName(model).clone();
    this.mesh.scale.setScalar(SCALE);
    this.mesh.visible = false;
    scene.add(this.mesh);
    // zwei Suchscheinwerfer auf Godzilla (echte Spotlichter, das einzige teure Licht der Bossphase)
    this.spots = [-1, 1].map(sx => {
      const s = new THREE.SpotLight(0xdde8ff, 0, 600, 0.16, 0.5, 1);
      s.position.set(sx * lamp[0], lamp[1], lamp[2]);
      this.mesh.add(s, s.target);
      return s;
    });
    this.beams = [-1, 1].map(sx => {
      // Kegel von 0 (Lampe, schmal) bis 1 (+Z, breit) – lookAt richtet +Z auf Godzilla
      const m = new THREE.Mesh(new THREE.CylinderGeometry(14, 1.2, 1, 16, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0.1, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
      m.frustumCulled = false;
      scene.add(m);
      m.visible = false;
      m.userData.sx = sx;
      return m;
    });
    this.missiles = [];
    this.active = false;
    this.dead = false;
    this.hp = HP;
    events.on('topple', e => this.onTopple(e));
  }

  // Auftritt: fliegt von Norden heran
  start(gz) {
    this.active = true;
    this.hp = HP;
    this.t = 0;
    this.gunT = 3;
    this.cadT = 8;
    this.angle = -Math.PI / 2;               // Norden
    this.mesh.position.set(gz.x, ALT + 60, gz.z - 700);
    this.mesh.visible = true;
    for (const b of this.beams) b.visible = true;
    this.events.emit('bossStart', {});
  }

  update(dt, g, city) {
    if (!this.active) return;
    this.t += dt;
    const gz = g.position, p = this.mesh.position;
    if (this.dead) { this.crash(dt); return; }
    // kreist langsam in Strahlweite, Bug immer auf Godzilla; ist die Sicht verdeckt, kreist sie schneller weiter
    const dist = Math.hypot(p.x - gz.x, p.z - gz.z);
    const want = (RANGE[0] + RANGE[1]) / 2 + Math.sin(this.t * 0.2) * 25;
    this.orbit ??= 1;
    this.angle = Math.atan2(p.z - gz.z, p.x - gz.x) + this.orbit * (this.blocked || this.stuck ? 0.35 : 0.06) * dt;
    const r = dist + THREE.MathUtils.clamp(want - dist, -40 * dt, 40 * dt);
    p.x = gz.x + Math.cos(this.angle) * r;
    p.z = gz.z + Math.sin(this.angle) * r;
    this.stuck = this.avoid(city) > 0;
    const alt = dist > RANGE[1] + 60 ? ALT_TRAVEL : ALT;
    p.y += (alt + 4 * Math.sin(this.t * 0.8) - p.y) * Math.min(1, dt);
    this.mesh.rotation.y = Math.atan2(gz.x - p.x, gz.z - p.z);
    this.mesh.rotation.z = 0.04 * Math.sin(this.t * 0.6);
    // Scheinwerfer auf Godzillas Brust
    for (const s of this.spots) { s.intensity = 2.2e4; s.target.position.copy(this.mesh.worldToLocal(_v.set(gz.x, 45, gz.z))); }
    for (const b of this.beams) {
      const from = this.mesh.localToWorld(_v.set(b.userData.sx * this.lamp[0], this.lamp[1], this.lamp[2]));
      const to = _w.set(gz.x, 40, gz.z);
      b.position.copy(from); b.lookAt(to); b.scale.set(1, 1, from.distanceTo(to));
    }
    // Bordgeschütz und Kadmium nur mit freier Sicht; Kadmium nur, wenn Godzilla im Hochhausviertel steht (sonst
    // könnte sie ihn auf dem Weg dorthin festnageln – die Falle mit den Hochhäusern muss erreichbar bleiben)
    if ((this.losT = (this.losT || 0) - dt) <= 0) {
      this.losT = 0.3;
      const from = _v.copy(p), to = _w.set(gz.x, 70, gz.z), len = from.distanceTo(to);   // Kopfhöhe: nur Hochhäuser verdecken
      const was = this.blocked;
      this.blocked = city.raycast(from, to.sub(from).normalize(), len) < len - 35;
      if (this.blocked && !was && Math.random() < 0.4) this.orbit *= -1;
    }
    const inTowers = Math.hypot(gz.x - city.center.x, gz.z - city.center.z) < city.cfg.towerR * 136 + 90;
    if (dist < RANGE[1] + 80 && !this.blocked) {
      if ((this.gunT -= dt) <= 0) { this.gunT = GUN_EVERY; this.shoot(g, false); }
      if (inTowers && (this.cadT -= dt) <= 0) {
        this.cadT = CADMIUM_EVERY;
        this.cadQueue = 2;
        this.events.emit('cadmiumWarning', { text: this.salvoText });
      }
      if (this.cadQueue > 0 && (this.cadQT = (this.cadQT || 0) - dt) <= 0) { this.cadQueue--; this.cadQT = 0.45; this.shoot(g, true); }
    }
    this.updateMissiles(dt, g, city);
  }

  // Weicht Gebäuden aus, die höher als die Flughöhe sind (gleitet nicht mehr durch Hochhäuser)
  avoid(city) {
    const p = this.mesh.position;
    let push = 0;
    for (const b of city.buildings) {
      if (!b.alive || b.h < p.y - 12) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      const ox = Math.abs(dx) - b.hw - 26, oz = Math.abs(dz) - b.hd - 26;      // 26 m Sicherheitsabstand
      if (ox >= 0 || oz >= 0) continue;
      if (ox > oz) p.x += Math.sign(dx || 1) * -ox; else p.z += Math.sign(dz || 1) * -oz;
      push += -Math.max(ox, oz);
    }
    return push;
  }

  shoot(g, cadmium) {
    const from = this.mesh.localToWorld(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 5.5, -2, 12));
    const target = cadmium ? g.mouth.getWorldPosition(new THREE.Vector3()) : g.position.clone().setY(30 + Math.random() * 30);
    const vel = target.sub(from).normalize().multiplyScalar(cadmium ? 70 : 260);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(cadmium ? 2.2 : 1, 8, 6),
      new THREE.MeshBasicMaterial({ color: cadmium ? 0xfff6d0 : 0xffc070, toneMapped: false }));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.missiles.push({ mesh, vel, cadmium, life: 6, hp: 1 });   // hp: Zielerfassung des Strahls
    this.fx.fire.emit(from.x, from.y, from.z, 2, { spread: 1, up: 1, out: 2, size: 5, life: 0.2 });
  }

  updateMissiles(dt, g, city) {
    const gz = g.position;
    this.missiles = this.missiles.filter(m => {
      m.life -= dt;
      const p = m.mesh.position;
      if (m.cadmium) {                       // Kadmium-Raketen lenken auf das Maul und ziehen eine helle Spur
        const mouth = g.mouth.getWorldPosition(_v);
        m.vel.lerp(_w.subVectors(mouth, p).normalize().multiplyScalar(70), Math.min(1, 2 * dt));
        this.fx.dust.emit(p.x, p.y, p.z, 1, { spread: 0.5, up: 0.2, out: 0.5, size: 6, life: 2, color: [0.6, 0.62, 0.55] });
      }
      p.addScaledVector(m.vel, dt);
      const dy = THREE.MathUtils.clamp(p.y, 6, 72);
      if (Math.hypot(p.x - gz.x, p.z - gz.z, p.y - dy) < (m.cadmium ? 16 : 15)) {
        if (m.cadmium) { if (this.stun) g.cadmium(); else g.takeDamage(SALVO_DAMAGE, p); this.military.boom(p, 0.8); this.fx.dust.emit(p.x, p.y, p.z, 10, { spread: 6, up: 2, out: 6, size: 14, life: 4, color: [0.75, 0.75, 0.65] }); }
        else { g.takeDamage(0.55, p); this.military.boom(p, 0.3); }
        this.scene.remove(m.mesh); m.hp = 0;
        return false;
      }
      if (city.inside(p)) { this.military.boom(p, 0.4); this.scene.remove(m.mesh); m.hp = 0; return false; }   // trifft ein Gebäude
      if (m.life <= 0 || p.y < 0) { this.scene.remove(m.mesh); m.hp = 0; return false; }
      return true;
    });
  }

  // Kadmium-Raketen kann Godzillas Strahl erfassen und abschießen
  targets() { return this.missiles.filter(m => m.cadmium); }

  // Atomstrahl: kratzt an der Panzerung, schießt aber Kadmium-Raketen ab
  beamLine(from, to, dt) {
    if (!this.active || this.dead) return;
    const ab = _w.subVectors(to, from), len2 = ab.lengthSq();
    const near = q => {                      // Abstand zur Strahllinie (eigener Hilfsvektor für t, sonst überschreibt er _v)
      const t = THREE.MathUtils.clamp(_d.subVectors(q, from).dot(ab) / len2, 0, 1);
      return _v.copy(from).addScaledVector(ab, t).distanceTo(q);
    };
    if (near(this.mesh.position) < 22) this.hitByBeam(dt, from);
    this.missiles = this.missiles.filter(m => {
      if (!m.cadmium || near(m.mesh.position) > 10) return true;
      this.military.boom(m.mesh.position, 0.6);
      this.scene.remove(m.mesh); m.hp = 0;
      return false;
    });
  }

  hitByBeam(dt) { this.damage(BEAM_DPS * dt, false); }

  // Abstand entlang des Strahls bis zum Rumpf (Kugel), damit der Strahl an ihr endet statt hindurchzugehen
  rayHit(o, d, max) {
    if (!this.active || this.dead) return max;
    const c = this.mesh.position, ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
    const t = ox * d.x + oy * d.y + oz * d.z, q = ox * ox + oy * oy + oz * oz - t * t, R = 20;
    if (t < 0 || q > R * R) return max;
    return Math.min(max, t - Math.sqrt(R * R - q));
  }

  // Ein umstürzendes Hochhaus trifft sie, wenn seine Fall-Linie unter ihr durchgeht und es hoch genug ist
  onTopple(e) {
    if (!this.active || this.dead) return;
    const p = this.mesh.position;
    const t = THREE.MathUtils.clamp((p.x - e.from.x) * e.dir.x + (p.z - e.from.z) * e.dir.z, 0, e.length);
    const d = Math.hypot(p.x - (e.from.x + e.dir.x * t), p.z - (e.from.z + e.dir.z * t));
    if (d < e.width + 22 && e.length > p.y * 0.9) this.damage(TOPPLE_DAMAGE, true);
  }

  damage(amount, big) {
    this.hp = Math.max(0, this.hp - amount);
    if (big) {
      this.military.boom(this.mesh.position, 1.4);
      this.events.emit('bossHit', { hp: this.hp });
      this.events.emit('shake', 1.4);
    }
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.vy = 0;
      this.events.emit('bossDown', {});
    }
  }

  // Absturz: trudelt brennend zu Boden, explodiert
  crash(dt) {
    const p = this.mesh.position;
    this.vy -= 18 * dt;
    p.y += this.vy * dt;
    this.mesh.rotation.z += dt * 0.8;
    this.mesh.rotation.x += dt * 0.3;
    for (const s of this.spots) s.intensity = 0;
    for (const b of this.beams) b.visible = false;
    this.fx.fire.emit(p.x, p.y, p.z, 2, { spread: 6, up: 4, out: 3, size: 10, life: 0.8 });
    this.fx.dust.emit(p.x, p.y, p.z, 1, { spread: 4, up: 3, out: 2, size: 16, life: 4, color: [0.08, 0.08, 0.08] });
    if (p.y <= 2) {
      this.military.boom(p, 2.5);
      this.fx.dust.emit(p.x, 0, p.z, 30, { spread: 30, up: 6, out: 16, size: 24, life: 6 });
      this.events.emit('bossCrash', { pos: p.clone() });
      this.events.emit('shake', 2.5);
      this.mesh.visible = false;
      this.active = false;
    }
  }
}


// ---------- Super-X2 (1989): Fire Mirror ----------
// Der goldene Spiegel am Bug schluckt den Atomstrahl und wirft ihn auf Godzilla zurück. Hält Godzilla lange genug drauf,
// überhitzt der Spiegel und schmilzt (wie im Film) – danach trifft der Strahl voll. Hochhäuser holen sie weiterhin herunter.
const MELT = 4.0;                  // s Atomstrahl auf den Spiegel bis zum Schmelzen
const COOL = 0.25;                 // Abkühlung pro s ohne Strahl
const REFLECT_DPS = 3;             // Schaden des zurückgeworfenen Strahls an Godzilla
const MELTED_DPS = 8;              // Strahlschaden nach dem Schmelzen
const MIRROR = [0, 1, 16.6];       // Spiegelmitte im Modell

export class SuperX2 extends SuperX {
  constructor(units, scene, fx, events, military) {
    super(units, scene, fx, events, military, 'U_superx2', [3.2, -1.6, 12.5]);
    this.stun = false;
    this.salvoText = 'RAKETENSALVE!';
    this.heat = 0;
    this.melted = false;
    this.reflT = 0;
    this.mesh.traverse(o => {
      if (o.isMesh && /mirror/i.test(o.material.name)) { o.material = o.material.clone(); this.mirrorMat = o.material; }
    });
    this.mirrorBase = this.mirrorMat ? this.mirrorMat.emissive.clone() : null;
    // Zurückgeworfener Strahl: gleiche Optik, goldener; ohne eigene Lichter (feste Lichtanzahl)
    this.reflect = new Beam(scene);
    this.reflect.layers[0].material.uniforms.uColor.value.setRGB(1.6, 0.7, 0.15);
    this.reflect.layers[1].material.uniforms.uColor.value.setRGB(2.4, 1.9, 1.0);
    this.reflect.impact.material.uniforms.uColor.value.setRGB(1.6, 0.9, 0.3);
    scene.remove(this.reflect.light, this.reflect.mouthLight);
  }

  // Godzilla erfasst die Super-X2 selbst mit dem Strahl (sie ist das eigentliche Ziel)
  targets() { return this.active && !this.dead ? super.targets().concat(this) : super.targets(); }

  hitByBeam(dt) {
    if (this.melted) { this.damage(MELTED_DPS * dt, false); return; }
    this.heat += dt;
    this.reflT = 0.12;
    if (this.heat >= MELT) {
      this.melted = true;
      this.reflT = 0;
      this.military.boom(this.mirror(_v), 1.2);
      this.events.emit('mirrorMelt', {});
      this.events.emit('shake', 1.0);
    }
  }

  mirror(out) { return this.mesh.localToWorld(out.set(MIRROR[0], MIRROR[1], MIRROR[2])); }

  update(dt, g, city) {
    super.update(dt, g, city);
    if (!this.active || this.dead) { this.reflect.update(dt, false); return; }
    if (this.reflT <= 0) this.heat = Math.max(0, this.heat - COOL * dt);
    // Spiegel glüht mit der Hitze auf, geschmolzen dunkel und rot verglüht
    if (this.mirrorMat) {
      if (this.melted) { this.mirrorMat.color.setRGB(0.12, 0.08, 0.06); this.mirrorMat.emissive.setRGB(0.5, 0.08, 0.02); this.mirrorMat.metalness = 0.3; }
      else this.mirrorMat.emissive.copy(this.mirrorBase).multiplyScalar(1 + 6 * this.heat / MELT);
    }
    if (this.melted && Math.random() < dt * 6) {
      const m = this.mirror(_v);
      this.fx.dust.emit(m.x, m.y, m.z, 1, { spread: 3, up: 2, out: 1, size: 10, life: 3, color: [0.1, 0.1, 0.1] });
    }
    // Rückstrahl vom Spiegel auf Godzillas Brust
    const on = (this.reflT -= dt) > 0;
    const from = this.mirror(_d), to = _w.copy(g.position).setY(48), len = from.distanceTo(to);
    const end = this.reflect.update(dt, on, from, to.sub(from).normalize(), len);
    if (on && end) {
      g.takeDamage(REFLECT_DPS * dt, end);
      g.hurt = 0;                               // kein Zurückzucken, sonst bricht der eigene Strahl ab
      if (Math.random() < dt * 20) this.fx.fire.emit(end.x, end.y, end.z, 1, { spread: 3, up: 1, out: 4, size: 8, life: 0.4 });
    }
  }

  crash(dt) {
    this.reflect.update(dt, false);
    super.crash(dt);
  }
}
