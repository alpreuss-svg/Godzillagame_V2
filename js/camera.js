// Feste Kamera schräg von oben, blickt nach Nordosten; gesteuert wird trotzdem nach Himmelsrichtung (W = Norden).
// Mausrad zoomt, Erschütterung bei Treffern.
import * as THREE from 'three';

const PITCH = 0.92;          // rad über dem Horizont (~53°)
const DIST = [320, 620];
const LOOK_Y = 30;           // Blickpunkt etwa in Hüfthöhe
const YAW = Math.PI / 4;     // Blickrichtung: 0 = Norden, PI/4 = Nordosten

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.dist = 460;
    this.target = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);   // Bewegung nach Himmelsrichtung, unabhängig vom Blickwinkel
    this.right = new THREE.Vector3(1, 0, 0);
    this.shakeAmt = 0;
  }

  shake(a) { this.shakeAmt = Math.min(2.5, Math.max(this.shakeAmt, a)); }

  snap(focus) { this.target.set(focus.x, LOOK_Y, focus.z); }

  update(dt, focus, input) {
    this.dist = THREE.MathUtils.clamp(this.dist * (1 + input.zoom * 0.08), DIST[0], DIST[1]);
    const k = 1 - Math.exp(-4 * dt);
    this.target.x += (focus.x - this.target.x) * k;
    this.target.z += (focus.z - this.target.z) * k;
    this.target.y = LOOK_Y;
    const h = Math.cos(PITCH) * this.dist;           // Kamera steht südwestlich und blickt nach Nordosten
    this.cam.position.set(this.target.x - Math.sin(YAW) * h, this.target.y + Math.sin(PITCH) * this.dist,
      this.target.z + Math.cos(YAW) * h);
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
