// Bossphase Super-X (1984): schwebt in Strahlweite, beleuchtet Godzilla mit Suchscheinwerfern, feuert mit dem Bordgeschütz
// und alle paar Sekunden Kadmium-Raketen, die Godzilla zusammensacken lassen. Gegen den Atomstrahl gepanzert – wie im
// Film hilft nur ein Hochhaus, das auf sie stürzt (das city-Ereignis 'topple' liefert die Fall-Linie).
import * as THREE from 'three';

const SCALE = 1.7;
const ALT = 52;                    // Schwebehöhe
const RANGE = [130, 190];          // Abstand zu Godzilla
const HP = 100;
const TOPPLE_DAMAGE = 38;          // drei Hochhäuser holen sie herunter
const BEAM_DPS = 1.5;              // Panzerung: der Strahl kratzt nur
const CADMIUM_EVERY = 14;          // s
const GUN_EVERY = 2.0;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

export class SuperX {
  constructor(units, scene, fx, events, military) {
    this.scene = scene;
    this.fx = fx;
    this.events = events;
    this.military = military;              // für Explosionen
    this.mesh = units.scene.getObjectByName('U_superx').clone();
    this.mesh.scale.setScalar(SCALE);
    this.mesh.visible = false;
    scene.add(this.mesh);
    // zwei Suchscheinwerfer auf Godzilla (echte Spotlichter, das einzige teure Licht der Bossphase)
    this.spots = [-1, 1].map(sx => {
      const s = new THREE.SpotLight(0xdde8ff, 0, 600, 0.16, 0.5, 1);
      s.position.set(sx * 5.5, -1, 13);
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

  update(dt, g) {
    if (!this.active) return;
    this.t += dt;
    const gz = g.position, p = this.mesh.position;
    if (this.dead) { this.crash(dt); return; }
    // kreist langsam in Strahlweite, Bug immer auf Godzilla
    const dist = Math.hypot(p.x - gz.x, p.z - gz.z);
    const want = (RANGE[0] + RANGE[1]) / 2 + Math.sin(this.t * 0.2) * 25;
    this.angle = Math.atan2(p.z - gz.z, p.x - gz.x) + 0.06 * dt;
    const r = dist + THREE.MathUtils.clamp(want - dist, -40 * dt, 40 * dt);
    p.x = gz.x + Math.cos(this.angle) * r;
    p.z = gz.z + Math.sin(this.angle) * r;
    p.y += (ALT + 4 * Math.sin(this.t * 0.8) - p.y) * Math.min(1, dt);
    this.mesh.rotation.y = Math.atan2(gz.x - p.x, gz.z - p.z);
    this.mesh.rotation.z = 0.04 * Math.sin(this.t * 0.6);
    // Scheinwerfer auf Godzillas Brust
    for (const s of this.spots) { s.intensity = 2.2e4; s.target.position.copy(this.mesh.worldToLocal(_v.set(gz.x, 45, gz.z))); }
    for (const b of this.beams) {
      const from = this.mesh.localToWorld(_v.set(b.userData.sx * 5.5, -1, 13));
      const to = _w.set(gz.x, 40, gz.z);
      b.position.copy(from); b.lookAt(to); b.scale.set(1, 1, from.distanceTo(to));
    }
    // Bordgeschütz und Kadmium
    if (dist < RANGE[1] + 80) {
      if ((this.gunT -= dt) <= 0) { this.gunT = GUN_EVERY; this.shoot(g, false); }
      if ((this.cadT -= dt) <= 0) {
        this.cadT = CADMIUM_EVERY;
        this.cadQueue = 2;
        this.events.emit('cadmiumWarning', {});
      }
      if (this.cadQueue > 0 && (this.cadQT = (this.cadQT || 0) - dt) <= 0) { this.cadQueue--; this.cadQT = 0.45; this.shoot(g, true); }
    }
    this.updateMissiles(dt, g);
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

  updateMissiles(dt, g) {
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
        if (m.cadmium) { g.cadmium(); this.military.boom(p, 0.8); this.fx.dust.emit(p.x, p.y, p.z, 10, { spread: 6, up: 2, out: 6, size: 14, life: 4, color: [0.75, 0.75, 0.65] }); }
        else { g.takeDamage(0.55, p); this.military.boom(p, 0.3); }
        this.scene.remove(m.mesh); m.hp = 0;
        return false;
      }
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
    if (near(this.mesh.position) < 22) this.damage(BEAM_DPS * dt, false);
    this.missiles = this.missiles.filter(m => {
      if (!m.cadmium || near(m.mesh.position) > 10) return true;
      this.military.boom(m.mesh.position, 0.6);
      this.scene.remove(m.mesh); m.hp = 0;
      return false;
    });
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
