// Einstieg: Renderer, Nachtstimmung, Laden, Spielzustände und Hauptschleife
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Godzilla } from './godzilla.js';
import { City, BAY_Z } from './city.js';

// Qualität: ?q=low für schwache Grafik (z. B. Intel UHD 615), ?q=high für mehr Kantenglättung/Schatten
const Q = new URLSearchParams(location.search).get('q') || 'mid';
const QUALITY = {
  low: { ratio: 1, aa: false, shadow: 512 },
  mid: { ratio: 1.25, aa: true, shadow: 1024 },
  high: { ratio: 2, aa: true, shadow: 2048 },
}[Q] || { ratio: 1.25, aa: true, shadow: 1024 };

class Events {
  constructor() { this.map = new Map(); }
  on(type, fn) { (this.map.get(type) || this.map.set(type, []).get(type)).push(fn); }
  emit(type, e) { for (const fn of this.map.get(type) || []) fn(e); }
}

const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.aa, powerPreference: 'high-performance',
  preserveDrawingBuffer: new URLSearchParams(location.search).has('debug') });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.ratio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const NIGHT = 0x0a0f1a;
scene.background = new THREE.Color(NIGHT);
scene.fog = new THREE.FogExp2(NIGHT, 0.0011);
const camera = new THREE.PerspectiveCamera(45, 1, 2, 4000);

// Mond von Nordwesten, Himmel bläulich, vom Boden der warme Widerschein der Stadt
scene.add(new THREE.HemisphereLight(0x3a4866, 0x3a2614, 0.9));
const moon = new THREE.DirectionalLight(0xa8bcff, 1.4);
moon.castShadow = true;
moon.shadow.mapSize.set(QUALITY.shadow, QUALITY.shadow);
Object.assign(moon.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 600 });
moon.shadow.bias = -0.0005;
moon.shadow.normalBias = 0.6;
scene.add(moon, moon.target);
const MOON_OFS = new THREE.Vector3(-120, 260, -260);   // im Norden: Gegenlicht beim Marsch in die Stadt
// Fülllicht schräg von der Kamera, damit der fast schwarze Körper lesbar bleibt
const fill = new THREE.DirectionalLight(0x8090b0, 0.9);
scene.add(fill, fill.target);
const FILL_OFS = new THREE.Vector3();

const events = new Events();
const input = new Input();
const rig = new CameraRig(camera);
const game = { state: 'loading', events, scene, renderer, camera, rig, input };
window.game = game;   // zum Ausprobieren in der Konsole

function show(id) {
  for (const s of ['loading', 'title', 'paused']) $(s).hidden = s !== id;
  $('screen').classList.toggle('off', !id);
  $('hud').hidden = !(game.state === 'play' || game.state === 'pause');
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

async function load() {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, done, total) => { $('progress').style.width = (100 * done / total) + '%'; };
  const loader = new GLTFLoader(manager);
  const [gz, city] = await Promise.all(['godzilla', 'city'].map(n => loader.loadAsync(`assets/models/${n}.glb`)));

  game.city = new City(city, scene);
  const g = game.godzilla = new Godzilla(gz, scene, events);
  g.position.set(0, 0, BAY_Z + 220);          // kommt aus der Bucht
  g.raycast = (o, d, max) => game.city.raycast(o, d, max);
  rig.snap(g.position);

  events.on('attack', e => game.city.damage(e.pos, e.radius, e.damage));
  events.on('stomp', e => rig.shake(0.35 * e.strength));
  events.on('roar', () => rig.shake(1.0));
  events.on('shake', a => rig.shake(a));

  game.state = 'title';
  show('title');
}

// Ein Spielschritt; game.step(dt) lässt sich auch von Hand aufrufen (Tests ohne sichtbares Fenster)
function step(dt) {
  input.update();
  const g = game.godzilla;

  if (game.state === 'title' && input.any) { game.state = 'play'; show(null); }
  else if (game.state === 'play' && input.pressed('pause')) { game.state = 'pause'; show('paused'); }
  else if (game.state === 'pause' && input.pressed('pause')) { game.state = 'play'; show(null); }

  if (g) {
    if (game.state === 'play') g.update(dt, input, rig);
    else if (game.state === 'title') { g.mixer.update(dt); rig.yaw += dt * 0.05; }
    if (game.state !== 'pause') rig.update(dt, g.position, game.state === 'play' ? input : IDLE);
    moon.position.copy(g.position).add(MOON_OFS);
    moon.target.position.copy(g.position);
    FILL_OFS.copy(camera.position).sub(g.position).addScaledVector(rig.right, -120);
    fill.position.copy(g.position).add(FILL_OFS);
    fill.target.position.copy(g.position);
    $('hp').style.width = g.hp + '%';
    $('en').style.width = g.energy + '%';
  }
  renderer.render(scene, camera);
  input.endFrame();
}
const IDLE = { cam: 0, zoom: 0 };
game.step = step;

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  step(Math.min(clock.getDelta(), 1 / 20));
}

show('loading');
load().catch(err => {
  console.error(err);
  $('loadtext').textContent = 'Fehler beim Laden: ' + err.message;
});
frame();
