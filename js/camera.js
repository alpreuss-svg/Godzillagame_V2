// Kamera schräg von oben hinter Godzilla, Q/E bzw. rechter Stick drehen, Mausrad zoomt, Erschütterung bei Treffern
import * as THREE from 'three';

const PITCH = 0.72;          // rad über dem Horizont
const DIST = [150, 460];
const LOOK_Y = 38;           // Blickpunkt etwa in Brusthöhe

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;            // 0 = Kamera steht südlich (+Z) und blickt nach Norden
    this.dist = 270;
    this.target = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.shakeAmt = 0;
  }

  shake(a) { this.shakeAmt = Math.min(2.5, Math.max(this.shakeAmt, a)); }

  snap(focus) { this.target.set(focus.x, LOOK_Y, focus.z); }

  update(dt, focus, input) {
    this.yaw -= input.cam * 1.6 * dt;
    this.dist = THREE.MathUtils.clamp(this.dist * (1 + input.zoom * 0.08), DIST[0], DIST[1]);
    const k = 1 - Math.exp(-4 * dt);
    this.target.x += (focus.x - this.target.x) * k;
    this.target.z += (focus.z - this.target.z) * k;
    this.target.y = LOOK_Y;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.forward.set(-s, 0, -c);
    this.right.set(c, 0, -s);
    const h = Math.cos(PITCH) * this.dist;
    this.cam.position.set(this.target.x + s * h, this.target.y + Math.sin(PITCH) * this.dist, this.target.z + c * h);
    this.cam.lookAt(this.target);
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 2.2;
      this.cam.position.x += (Math.random() - 0.5) * a;
      this.cam.position.y += (Math.random() - 0.5) * a;
      this.cam.position.z += (Math.random() - 0.5) * a;
      this.shakeAmt *= Math.exp(-5 * dt);
    }
  }
}
