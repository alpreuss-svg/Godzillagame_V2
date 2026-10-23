// Bilderbogen der Monster aus dem laufenden Spiel (nur zum Prüfen, mit ?debug): Studiolicht, ohne Stadt, Regen und Nebel,
// drei Ansichten nebeneinander, als JPEG an einen lokalen Empfänger (POST http://localhost:8124/<name>.jpg).
// Aufruf in der Konsole: const { studio, shoot } = await import('/tools/shoot.js'); studio(); await shoot('rodan', 'Rodan', obj)
import * as THREE from 'three';

let lights = null;

export function studio() {
  const game = window.game, scene = game.scene;
  scene.traverse(o => { if (o.isInstancedMesh || o.isLineSegments || o.isPoints) o.visible = false; });
  scene.fog = null;
  if (!lights) {
    lights = [new THREE.HemisphereLight(0xdfe6ff, 0x3a3530, 2.2), new THREE.DirectionalLight(0xffffff, 2.6), new THREE.DirectionalLight(0xbfd0ff, 1.0)];
    lights[1].position.set(300, 500, 400); lights[2].position.set(-400, 200, -300);
    for (const l of lights) scene.add(l);
  }
}

// obj: Object3D (Mitte = Weltposition) oder {center: Vector3, yaw}; size: Höhe des Monsters in Metern
export async function shoot(name, title, obj, size = 90, yawOffsets = [0.6, 1.75, 3.6]) {
  const game = window.game, r = game.renderer, cam = game.camera;
  const c = new THREE.Vector3(), q = new THREE.Quaternion();
  let yaw;
  if (obj.isObject3D) {
    obj.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(obj).getCenter(c);
    obj.getWorldQuaternion(q);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    yaw = Math.atan2(f.x, f.z);
  } else { c.copy(obj.center); yaw = obj.yaw || 0; }
  const W = r.domElement.width, H = r.domElement.height;
  const sheet = document.createElement('canvas');
  sheet.width = W * 3; sheet.height = H + 60;
  const g2 = sheet.getContext('2d');
  g2.fillStyle = '#16181c'; g2.fillRect(0, 0, sheet.width, sheet.height);
  const dist = size * 2.1;
  yawOffsets.forEach((a, i) => {
    const ang = yaw + a;
    cam.position.set(c.x + Math.sin(ang) * dist, c.y + size * 0.25, c.z + Math.cos(ang) * dist);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    r.render(game.scene, cam);
    g2.drawImage(r.domElement, i * W, 60);
  });
  g2.fillStyle = '#e8e2d0'; g2.font = 'bold 34px sans-serif'; g2.fillText(title, 20, 42);
  g2.font = '22px sans-serif'; g2.fillStyle = '#a8a39a';
  ['vorn schräg', 'Seite', 'hinten schräg'].forEach((t, i) => g2.fillText(t, i * W + W - 170, 42));
  const blob = await new Promise(res => sheet.toBlob(res, 'image/jpeg', 0.86));
  await fetch('http://localhost:8124/' + name + '.jpg', { method: 'POST', body: blob });
  return name;
}
