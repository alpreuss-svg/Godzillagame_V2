// Nachtstimmung: Regen um die Kamera, Flak-Suchscheinwerfer, die Godzilla abtasten, und flackerndes Licht von Bränden.
// Alles mit fester Anzahl Objekte/Lichter, damit Three.js keine Shader neu übersetzen muss.
import * as THREE from 'three';

const P = 136;

export class Atmosphere {
  constructor(scene, { rain = 1200, fireLights = 4, searchlights = 5 } = {}) {
    this.scene = scene;
    // Regen: kurze Schlieren in einem Kasten, der mit dem Blickpunkt mitwandert
    this.rainN = rain;
    this.box = new THREE.Vector3(700, 320, 700);
    const pos = new Float32Array(rain * 6);
    this.drops = new Float32Array(rain * 3);
    for (let i = 0; i < rain; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.drops[i * 3 + 1] = Math.random() * this.box.y;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8090a8, transparent: true, opacity: 0.28, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = rain > 0;
    scene.add(this.rain);
    this.wind = new THREE.Vector3(-14, -95, 6);         // m/s: Regen fällt schräg

    // Flak-Suchscheinwerfer: additive Lichtkegel von Kreuzungen rund um Godzilla
    const cone = new THREE.CylinderGeometry(16, 1.5, 1, 18, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0.045, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.lights = [];
    for (let i = 0; i < searchlights; i++) {
      const m = new THREE.Mesh(cone, mat);
      m.frustumCulled = false;
      scene.add(m);
      this.lights.push({ mesh: m, base: new THREE.Vector3(), phase: Math.random() * 10, placed: false });
    }

    // Brandlicht: wenige Punktlichter springen zu den nächsten Bränden
    this.fires = [];
    for (let i = 0; i < fireLights; i++) {
      const l = new THREE.PointLight(0xff7a30, 0, 140, 1.2);
      scene.add(l);
      this.fires.push(l);
    }
    this.time = 0;
  }

  update(dt, camera, g, city, focus) {
    this.time += dt;
    this.updateRain(dt, focus);
    this.updateSearchlights(dt, g);
    this.updateFireLights(city, focus);
  }

  updateRain(dt, focus) {
    if (!this.rain.visible) return;
    const pos = this.rain.geometry.attributes.position.array, d = this.drops, b = this.box, w = this.wind;
    const len = 0.06;                                    // Länge der Schliere in Sekunden Fallweg
    for (let i = 0; i < this.rainN; i++) {
      const j = i * 3;
      d[j] += w.x * dt; d[j + 1] += w.y * dt; d[j + 2] += w.z * dt;
      if (d[j + 1] < 0) { d[j + 1] += b.y; d[j] = (Math.random() - 0.5) * b.x; d[j + 2] = (Math.random() - 0.5) * b.z; }
      if (d[j] < -b.x / 2) d[j] += b.x;
      const x = focus.x + d[j], y = d[j + 1], z = focus.z + d[j + 2], k = i * 6;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      pos[k + 3] = x - w.x * len; pos[k + 4] = y - w.y * len; pos[k + 5] = z - w.z * len;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // Scheinwerfer stehen auf Kreuzungen 250–450 m um Godzilla; zu weit weg geratene springen auf eine neue Kreuzung
  updateSearchlights(dt, g) {
    const gz = g.position;
    for (const s of this.lights) {
      if (!s.placed || s.base.distanceTo(_v.set(gz.x, 0, gz.z)) > 520) {
        const a = Math.random() * Math.PI * 2, r = 250 + Math.random() * 200;
        s.base.set((Math.round((gz.x + Math.cos(a) * r) / P - 0.5) + 0.5) * P, 1, (Math.round((gz.z + Math.sin(a) * r) / P - 0.5) + 0.5) * P);
        s.placed = true;
      }
      // tasten pendelnd um Godzillas Oberkörper und streifen gelegentlich in den Himmel
      const t = this.time * 0.35 + s.phase;
      _w.set(gz.x + Math.sin(t * 1.3) * 40, 55 + Math.sin(t * 0.7) * 35 + Math.max(0, Math.sin(t * 0.23)) * 160, gz.z + Math.cos(t * 1.1) * 40);
      s.mesh.position.copy(s.base);
      s.mesh.lookAt(_w);
      s.mesh.scale.set(1, 1, s.base.distanceTo(_w) * 1.25);
    }
  }

  updateFireLights(city, focus) {
    const spots = [];
    for (const b of city.burning) spots.push([b.fire.x, b.fire.y + 4, b.fire.z]);
    for (const s of city.smolder) if (s.t < 15) spots.push([s.x, 6, s.z]);
    spots.sort((a, b) => Math.hypot(a[0] - focus.x, a[2] - focus.z) - Math.hypot(b[0] - focus.x, b[2] - focus.z));
    this.fires.forEach((l, i) => {
      const s = spots[i];
      if (!s) { l.intensity = 0; return; }
      l.position.set(s[0], s[1], s[2]);
      l.intensity = 900 * (0.75 + 0.25 * Math.sin(this.time * 13 + i * 1.7) * Math.sin(this.time * 7.3 + i));
    });
  }

  setRain(on) { this.rain.visible = on && this.rainN > 0; }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
