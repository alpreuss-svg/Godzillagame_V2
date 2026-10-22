// Stadt aus city.glb: ein InstancedMesh pro Gebäudetyp und Material, Straßenraster, Bucht im Süden
import * as THREE from 'three';

const P = 136;                 // Rastermaß: Blockmitten liegen auf Vielfachen von P
const ROAD = 26;
const BLOCK = P - ROAD;
const N = 10;                  // Blöcke in jede Richtung
export const BAY_Z = 7.5 * P;  // südlich davon Wasser

const ZONES = {
  tower: { lots: 2, types: ['tower_glass', 'tower_tri', 'tower_step', 'office_b', 'tower_glass', 'office_a'] },
  office: { lots: 2, types: ['office_a', 'office_b', 'office_c', 'apt_a', 'apt_b', 'apt_b'] },
  mixed: { lots: 4, types: ['shop_a', 'shop_b', 'apt_b', 'house_a', 'house_b', 'house_a', 'house_b'] },
  port: { lots: 2, types: ['warehouse', 'warehouse', 'oiltank'] },
};
const SHINJUKU = new THREE.Vector2(0, -4 * P);

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function zoneOf(i, j) {
  const z = j * P;
  if (z > BAY_Z - 2 * P) return 'port';
  const d = Math.hypot(i * P - SHINJUKU.x, z - SHINJUKU.y) / P;
  if (d < 2.4) return 'tower';
  if (d < 5.5) return 'office';
  return 'mixed';
}

export class City {
  constructor(gltf, scene, seed = 1984) {
    this.types = {};
    for (const node of gltf.scene.children) {
      const meshes = [];
      node.traverse(o => { if (o.isMesh) meshes.push(o); });
      this.types[node.name.replace(/^B_/, '')] = { size: node.userData.size || [12, 12, 4], meshes };
    }
    this.buildings = this.layout(rng(seed));
    this.instanced = this.instantiate(scene);
    scene.add(makeGround(), makeWater());
  }

  layout(rand) {
    const out = [];
    for (let j = -N; j * P < BAY_Z - P * 0.5; j++) {
      for (let i = -N; i <= N; i++) {
        const zone = ZONES[zoneOf(i, j)];
        const cx = i * P, cz = j * P;
        if (zone === ZONES.tower && rand() < 0.15) {         // ganze Blöcke für die Hotelscheibe
          out.push(this.place('tower_slab', cx, cz, rand() < 0.5 ? 0 : Math.PI));
          continue;
        }
        const L = zone.lots, lot = BLOCK / L, room = lot - 4;
        for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) {
          if (rand() < 0.1) continue;                         // Parkplatz / Lücke
          const lx = cx - BLOCK / 2 + lot * (a + 0.5), lz = cz - BLOCK / 2 + lot * (b + 0.5);
          const pick = [...zone.types].sort(() => rand() - 0.5);
          for (const t of pick) {
            const [w, d] = this.types[t].size;
            const turn = rand() < 0.5;
            const [fw, fd] = turn ? [d, w] : [w, d];
            if (fw > room || fd > room) continue;
            const jx = (room - fw) * (rand() - 0.5), jz = (room - fd) * (rand() - 0.5);
            out.push(this.place(t, lx + jx, lz + jz, (turn ? Math.PI / 2 : 0) + (rand() < 0.5 ? Math.PI : 0)));
            break;
          }
        }
      }
    }
    return out;
  }

  place(type, x, z, rot) {
    const [w, d, h] = this.types[type].size;
    const quarter = Math.abs(Math.sin(rot)) > 0.5;
    return { type, x, z, rot, hw: (quarter ? d : w) / 2, hd: (quarter ? w : d) / 2, h, hp: 40 + h * 2.5, alive: true };
  }

  instantiate(scene) {
    const groups = {};
    for (const b of this.buildings) (groups[b.type] ||= []).push(b);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const list = [];
    for (const [type, bs] of Object.entries(groups)) {
      const meshes = this.types[type].meshes.map(src => {
        const im = new THREE.InstancedMesh(src.geometry, src.material, bs.length);
        im.receiveShadow = true;
        scene.add(im);
        list.push(im);
        return im;
      });
      bs.forEach((b, k) => {
        b.meshes = meshes; b.index = k;
        m.compose(new THREE.Vector3(b.x, 0, b.z), q.setFromAxisAngle(up, b.rot), new THREE.Vector3(1, 1, 1));
        for (const im of meshes) im.setMatrixAt(k, m);
      });
      for (const im of meshes) im.computeBoundingSphere();
    }
    return list;
  }

  // Abstand entlang des Strahls bis zum ersten stehenden Gebäude (Achsen-Box-Test)
  raycast(o, d, max) {
    let best = max;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const s = slab(o.x, d.x, b.x - b.hw, b.x + b.hw, 0, best);
      if (!s) continue;
      const s2 = slab(o.y, d.y, 0, b.h, s[0], s[1]);
      if (!s2) continue;
      const s3 = slab(o.z, d.z, b.z - b.hd, b.z + b.hd, s2[0], s2[1]);
      if (s3 && s3[0] < best) best = s3[0];
    }
    return best;
  }

  // Schaden im Umkreis; zerstörte Gebäude verschwinden vorerst (Einsturz folgt mit dem Zerstörungssystem)
  damage(pos, radius, amount) {
    const destroyed = [];
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const dx = Math.max(Math.abs(pos.x - b.x) - b.hw, 0), dz = Math.max(Math.abs(pos.z - b.z) - b.hd, 0);
      if (dx * dx + dz * dz > radius * radius || pos.y > b.h + radius) continue;
      b.hp -= amount;
      if (b.hp <= 0) {
        b.alive = false;
        const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (const im of b.meshes) { im.setMatrixAt(b.index, zero); im.instanceMatrix.needsUpdate = true; }
        destroyed.push(b);
      }
    }
    return destroyed;
  }
}

// Strahl gegen ein Achsenintervall; schränkt [t0, t1] ein, null wenn verfehlt. Ein geteiltes Array, keine Allokation.
const SLAB = [0, 0];
function slab(o, d, lo, hi, t0, t1) {
  if (Math.abs(d) < 1e-6) return o < lo || o > hi ? null : (SLAB[0] = t0, SLAB[1] = t1, SLAB);
  let a = (lo - o) / d, c = (hi - o) / d;
  if (a > c) { const t = a; a = c; c = t; }
  SLAB[0] = Math.max(t0, a); SLAB[1] = Math.min(t1, c);
  return SLAB[0] <= SLAB[1] ? SLAB : null;
}

// Boden: eine Kachel = ein Block samt halber Straße ringsum
function makeGround() {
  const S = 512, px = S / P, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#16171a'; g.fillRect(0, 0, S, S);                       // Asphalt
  const r = ROAD / 2 * px, sw = 4 * px;
  g.fillStyle = '#3a3a3c'; g.fillRect(r, r, S - 2 * r, S - 2 * r);        // Gehweg
  g.fillStyle = '#2a2b2c'; g.fillRect(r + sw, r + sw, S - 2 * (r + sw), S - 2 * (r + sw));
  g.strokeStyle = '#8a8270'; g.lineWidth = 2; g.setLineDash([14, 18]);   // Mittellinien auf dem Kachelrand
  for (const o of [1, S - 1]) {
    g.beginPath(); g.moveTo(o, 0); g.lineTo(o, S); g.stroke();
    g.beginPath(); g.moveTo(0, o); g.lineTo(S, o); g.stroke();
  }
  g.setLineDash([]); g.fillStyle = '#9a9a92';                             // Zebrastreifen
  for (let k = 0; k < 6; k++) {
    const y = r + sw + 6 + k * 9;
    g.fillRect(2, y, r - 6, 4); g.fillRect(S - r + 4, y, r - 6, 4);
    g.fillRect(y, 2, 4, r - 6); g.fillRect(y, S - r + 4, 4, r - 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const size = P * 2 * (N + 2);
  tex.repeat.set(size / P, size / P);
  tex.offset.set(0.5, 0.5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function makeWater() {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x0c1a28, roughness: 0.55, metalness: 0.1 }));
  w.rotation.x = -Math.PI / 2;
  w.position.set(0, 0.3, BAY_Z + 1000);
  w.receiveShadow = true;
  return w;
}
