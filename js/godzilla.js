// Godzilla: Steuerung, Animationsmischung, Angriffe, Plattenleuchten
import * as THREE from 'three';
import { Beam, Shockwave } from './effects.js';

// Muss zur Laufanimation passen (gz_anim.py: WALK_DIST / WALK_T = 30 m / 2 s), sonst gleiten die Füße
const WALK_SPEED = 15;          // m/s bei vollem Ausschlag
const TURN_RATE = 1.4;          // rad/s
const BREATH_TURN = 0.45;       // rad/s – Strahl langsam schwenken
const CHARGE_TIME = 1.1;        // s, Platten laden vom Schwanz zum Hals
const BREATH_PITCH = 0.36;      // rad nach unten, trifft den Boden ~200 m voraus
const BREATH_COST = 20;         // Energie pro Sekunde
const PULSE_COST = 30;
const CLAW_DAMAGE = 60, TAIL_DAMAGE = 80, PULSE_DAMAGE = 140, BEAM_DPS = 220;
const BODY_RADIUS = 13;          // Körperkreis, der Gebäude beim Gehen zermalmt
const FADE = 0.15;              // s Überblendzeit der Einzelanimationen
const COMBO = ['clawL', 'clawR', 'tail'];
const MOUTH = new THREE.Vector3(0, 72.9, 19.4);   // Maulspitze im Modell (Bind-Pose, glTF: +Z vorn)
const PLATE_TOP = 74;                              // höchste Platte (Bind-Pose y)
const STOMP_Y = 7.0;                               // Knöchelhöhe, unter der ein Fuß als aufgesetzt gilt (steht bei 6,6)
export const BOUNDS = 1500;

const _dir = new THREE.Vector3(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

function approach(cur, target, step) { return cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target); }
function angleDiff(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
function smooth(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }

export class Godzilla {
  constructor(gltf, scene, events) {
    this.events = events;
    this.root = gltf.scene;
    this.bones = {};
    this.root.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (o.material.name === 'GZ_Plates') this.plateU = initPlates(o.material);
        if (o.material.name === 'GZ_Body') this.bodyMat = o.material;
      }
    });
    scene.add(this.root);
    // Die Vertexfarben sind filmgetreu fast schwarz (linear ~0,02) – nachts aufhellen, damit die Gestalt lesbar bleibt
    this.bodyMat.color.setScalar(3);

    // Hilfspunkt an der Maulspitze, hängt am Kopfknochen und folgt so allen Animationen
    this.root.updateMatrixWorld(true);
    this.mouth = new THREE.Object3D();
    this.mouth.position.copy(MOUTH).applyMatrix4(_m.copy(this.bones.head.matrixWorld).invert());
    this.bones.head.add(this.mouth);

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (clip.name !== 'idle' && clip.name !== 'walk') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.actions.idle.play();
    this.actions.walk.play();
    this.layers = new Map();      // laufende Einzelanimation -> Gewicht
    this.current = null;

    this.heading = Math.PI;       // 0 = schaut nach +Z (Süden), PI = Norden
    this.speed = 0;
    this.state = 'free';
    this.t = 0;
    this.hp = 100;
    this.energy = 100;
    this.combo = 0;
    this.queued = false;
    this.charge = 0;              // Ladefront der Platten 0..1
    this.glow = 0;                // Leuchtstärke der Platten
    this.firing = false;
    this.beam = new Beam(scene);
    this.wave = new Shockwave(scene);
    this.footY = { L: 99, R: 99 };
    this.raycast = null;          // vom Spiel gesetzt: (from, dir, max) -> Abstand
    this.collide = null;          // vom Spiel gesetzt: (mitte, radius, dt) -> Höhe des blockierenden Gebäudes
  }

  get position() { return this.root.position; }

  forward(out = _v) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  play(name, timeScale = 1) {
    const a = this.actions[name];
    a.reset();
    a.timeScale = timeScale;
    a.setEffectiveWeight(this.layers.get(a) || 0);
    a.play();
    if (!this.layers.has(a)) this.layers.set(a, 0);
    this.current = a;
    this.dur = a.getClip().duration / timeScale;
  }

  enter(state) { this.state = state; this.t = 0; }

  finish() { this.current = null; this.enter('free'); }

  turnToward(dir, maxStep) {
    const d = angleDiff(this.heading, Math.atan2(dir.x, dir.z));
    this.heading += Math.max(-maxStep, Math.min(maxStep, d));
    return d;
  }

  update(dt, input, rig) {
    this.t += dt;
    const mv = input.move;
    _dir.set(0, 0, 0).addScaledVector(rig.right, mv.x).addScaledVector(rig.forward, mv.y);
    const mag = Math.min(1, _dir.length());
    let targetSpeed = 0;

    switch (this.state) {
      case 'free': {
        if (mag > 0.15) {
          const d = this.turnToward(_dir, TURN_RATE * dt);
          targetSpeed = WALK_SPEED * mag * Math.max(0, Math.cos(d)) ** 2;
        }
        if (input.pressed('claw')) this.attack(0);
        else if (input.pressed('breath') && this.energy > 10) { this.firing = false; this.play('breath'); this.enter('breath'); }
        else if (input.pressed('roar')) { this.play('roar'); this.enter('roar'); this.roared = false; }
        else if (input.pressed('pulse') && this.energy >= PULSE_COST) {
          this.energy -= PULSE_COST; this.play('roar', 1.5); this.enter('pulse'); this.released = false;
        }
        break;
      }
      case 'attack': this.updateAttack(dt, input); break;
      case 'breath': this.updateBreath(dt, input, mag); break;
      case 'roar':
        if (!this.roared && this.t > 0.6) { this.roared = true; this.events.emit('roar', { pos: this.position }); }
        if (this.t > this.dur - FADE) this.finish();
        break;
      case 'pulse':
        this.charge = Math.min(1, this.t / 0.4);
        this.glow = 1.6;
        if (!this.released && this.t > 0.45) {
          this.released = true;
          const p = this.position.clone().setY(35);
          this.wave.fire(p, 130);
          this.events.emit('attack', { kind: 'pulse', pos: p.setY(0), from: p, radius: 130, damage: PULSE_DAMAGE, falloff: true, height: 35 });
          this.events.emit('shake', 2.2);
        }
        if (this.t > 0.95) this.finish();
        break;
    }

    // Bewegung; Gebäude vor der Brust werden zermalmt und bremsen (Hochhäuser stärker als Häuser)
    this.speed = approach(this.speed, targetSpeed, 16 * dt);
    const p = this.position;
    if (this.collide && this.speed > 0.5) {
      const block = this.collide(_v.copy(p).addScaledVector(this.forward(new THREE.Vector3()), 7), BODY_RADIUS, dt);
      if (block > 0) this.speed = Math.min(this.speed, block > 60 ? 2.5 : 5);
    }
    p.addScaledVector(this.forward(), this.speed * dt);
    p.x = THREE.MathUtils.clamp(p.x, -BOUNDS, BOUNDS);
    p.z = THREE.MathUtils.clamp(p.z, -BOUNDS, BOUNDS);
    this.root.rotation.y = this.heading;

    this.updateWeights(dt);
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    this.updateStomp();
    this.updateBreathFx(dt);
    this.wave.update(dt);
    this.updateGlow(dt);
    if (this.state !== 'breath') this.energy = Math.min(100, this.energy + 5 * dt);
  }

  // ---------- Klauen-Kombo: J, J, J -> linke Klaue, rechte Klaue, Schwanzdrehung ----------
  attack(step) {
    this.combo = step;
    this.queued = false;
    this.hitDone = false;
    this.play(COMBO[step]);
    this.enter('attack');
    this.spun = 0;
  }

  updateAttack(dt, input) {
    const name = COMBO[this.combo];
    if (input.pressed('claw') && this.t > 0.12) this.queued = true;
    if (name === 'tail') {
      // Der Schwanzhieb ist eine volle Drehung des Körpers; die Animation holt dazu weit aus
      const k = smooth((this.t - 0.1) / (this.dur * 0.8));
      this.heading += (k - this.spun) * Math.PI * 2;
      this.spun = k;
      if (!this.hitDone && this.t > this.dur * 0.45) {
        this.hitDone = true;
        this.events.emit('attack', { kind: 'tail', pos: this.position.clone(), from: this.position.clone(), radius: 75, damage: TAIL_DAMAGE, height: 12 });
        this.events.emit('shake', 0.8);
      }
    } else if (!this.hitDone && this.t > this.dur * 0.45) {
      this.hitDone = true;
      const pos = this.position.clone().addScaledVector(this.forward(), 24);
      this.events.emit('attack', { kind: 'claw', pos, from: this.position.clone(), radius: 22, damage: CLAW_DAMAGE, height: 45 });
      this.events.emit('shake', 0.4);
    }
    if (this.queued && this.combo < COMBO.length - 1 && this.t > this.dur * 0.55) this.attack(this.combo + 1);
    else if (this.t > this.dur - FADE) this.finish();
  }

  // ---------- Atomstrahl: K halten -> Platten laden, dann Strahl solange gehalten und Energie da ----------
  updateBreath(dt, input, mag) {
    if (mag > 0.15) this.turnToward(_dir, BREATH_TURN * dt);
    const held = input.down('breath');
    this.glow = 1;
    if (!this.firing) {
      this.charge = Math.min(1, this.charge + dt / CHARGE_TIME);
      if (!held) this.finish();
      else if (this.charge >= 1) { this.firing = true; this.events.emit('breath', { on: true }); }
    } else {
      this.energy = Math.max(0, this.energy - BREATH_COST * dt);
      this.events.emit('shake', 0.25);
      if (!held || this.energy <= 0) { this.firing = false; this.events.emit('breath', { on: false }); this.finish(); }
    }
  }

  updateBreathFx(dt) {
    const from = this.mouth.getWorldPosition(new THREE.Vector3());
    const c = Math.cos(BREATH_PITCH);
    const dir = new THREE.Vector3(Math.sin(this.heading) * c, -Math.sin(BREATH_PITCH), Math.cos(this.heading) * c);
    let max = from.y / Math.sin(BREATH_PITCH);              // bis zum Boden
    if (this.raycast) max = Math.min(max, this.raycast(from, dir, max));
    const end = this.beam.update(dt, this.firing, from, dir, max);
    if (end) this.events.emit('attack', { kind: 'beam', pos: end, from: this.position, radius: 16, damage: BEAM_DPS * dt });
  }

  // ---------- Einzelanimationen über Fortbewegung legen (Gewichte summieren sich zu 1) ----------
  updateWeights(dt) {
    let sum = 0;
    for (const [a, w] of this.layers) {
      const nw = approach(w, a === this.current ? 1 : 0, dt / FADE);
      if (nw === 0 && a !== this.current) { a.stop(); this.layers.delete(a); continue; }
      this.layers.set(a, nw);
      sum += nw;
    }
    const norm = sum > 1 ? 1 / sum : 1;
    for (const [a, w] of this.layers) a.setEffectiveWeight(w * norm);
    const loco = Math.max(0, 1 - sum);
    // Schon ab 30 % Tempo nur noch Gehen, dafür langsamer abgespielt: Mischposen aus Stand und Gehen rutschen
    const s = Math.min(1, this.speed / WALK_SPEED);
    const w = Math.min(1, s / 0.3);
    this.actions.idle.setEffectiveWeight(loco * (1 - w));
    this.actions.walk.setEffectiveWeight(loco * w);
    this.actions.walk.timeScale = Math.max(0.1, s);    // Schritttempo folgt exakt der Geschwindigkeit
  }

  updateStomp() {
    for (const side of ['L', 'R']) {
      const y = this.bones['foot' + side].getWorldPosition(_v).y;   // GLTFLoader entfernt den Punkt aus "foot.L"
      if (this.speed > 1.5 && this.footY[side] > STOMP_Y && y <= STOMP_Y) {
        this.events.emit('stomp', { pos: _v.clone().setY(0), strength: this.speed / WALK_SPEED });
      }
      this.footY[side] = y;
    }
  }

  updateGlow(dt) {
    const active = this.state === 'breath' || this.state === 'pulse';
    if (!active) {
      this.glow = approach(this.glow, 0, dt * 2.5);
      if (this.glow === 0) this.charge = 0;
    }
    const u = this.plateU;
    u.uFront.value = -4 + (PLATE_TOP + 8) * this.charge;
    u.uGlow.value = this.glow * (this.firing ? 2.2 : 1.4);
    u.uTime.value += dt;
    const pulse = this.state === 'pulse' && this.t > 0.35 ? Math.max(0, 1 - (this.t - 0.45) * 3) : 0;
    this.bodyMat.emissive.setRGB(0.05, 0.12, 0.3).multiplyScalar(pulse * 3 + (this.firing ? 0.35 : 0));
  }
}

// Plattenmaterial: Leuchten wandert vom Schwanz (Bind-Pose y klein) zum Hals (y groß)
function initPlates(mat) {
  const u = {
    uFront: { value: -4 }, uGlow: { value: 0 }, uTime: { value: 0 },
    uColor: { value: new THREE.Color(0.3, 0.65, 1.0).multiplyScalar(2.2) },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying float vBindY;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vBindY = position.y;');
    sh.fragmentShader = 'uniform float uFront, uGlow, uTime;\nuniform vec3 uColor;\nvarying float vBindY;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float lit = smoothstep(uFront + 3.0, uFront - 3.0, vBindY);
  float flick = 0.8 + 0.2 * sin(uTime * 31.0 + vBindY * 0.9);
  totalEmissiveRadiance += uColor * lit * uGlow * flick;`);
  };
  mat.customProgramCacheKey = () => 'gz-plates';
  return u;
}
