// Einstieg: Renderer, Nachtstimmung, Laden, Spielzustände und Hauptschleife
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Godzilla } from './godzilla.js';
import { City, BAY_Z } from './city.js';
import { Particles, Debris } from './effects.js';
import { seeThrough } from './buildings.js';

// Qualität: ?q=low für schwache Grafik (z. B. Intel UHD 615), ?q=high für mehr Kantenglättung/Schatten
const Q = new URLSearchParams(location.search).get('q') || 'mid';
const QUALITY = {
  low: { ratio: 1, aa: false, shadow: 512, dust: 500, fire: 250 },
  mid: { ratio: 1.25, aa: true, shadow: 1024, dust: 1000, fire: 500 },
  high: { ratio: 2, aa: true, shadow: 2048, dust: 1600, fire: 800 },
}[Q] || { ratio: 1.25, aa: true, shadow: 1024, dust: 1000, fire: 500 };

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
  const [gz, city, units] = await Promise.all(['godzilla', 'city', 'units'].map(n => loader.loadAsync(`assets/models/${n}.glb`)));

  const fx = game.fx = {
    dust: new Particles(scene, QUALITY.dust),
    fire: new Particles(scene, QUALITY.fire, { ramp: [[1.0, 0.72, 0.3], [0.45, 0.05, 0.0]], additive: true, opacity: 0.9, grow: 0.5 }),
    debris: new Debris(scene, [0, 1, 2].map(i => units.scene.getObjectByName('U_debris' + i))),
  };
  game.city = new City(city, scene, fx, events);
  const g = game.godzilla = new Godzilla(gz, scene, events);
  g.position.set(-1200, 0, BAY_Z + 200);      // kommt im Südwesten der Karte aus der Bucht
  g.raycast = (o, d, max) => game.city.raycast(o, d, max);
  g.collide = (c, r, dt) => game.city.crush(c, r, dt);
  rig.snap(g.position);

  // Treffer-Effekte (Brocken, Staub, Brände) erzeugt die Stadt selbst am Einschlagpunkt
  events.on('attack', e => {
    game.city.damage(e.pos, e.radius, e.damage, e.from, e.falloff, e.height ?? e.pos.y);
    if (e.kind === 'beam' && e.pos.y < 3 && Math.random() < 0.5) game.city.scars.burn(e.pos.x, e.pos.z, 9);
    if (e.kind === 'pulse') game.city.scars.scorch(e.pos.x, e.pos.z, e.radius * 0.9, 0.6);
  });
  events.on('stomp', e => {
    rig.shake(0.35 * e.strength);
    game.city.damage(e.pos, 14, 60, e.pos, false, 3);
    game.city.decals.add('impact', e.pos.x, e.pos.z, Math.random() * 6.3, 16 + Math.random() * 10);
    game.city.scars.blob(e.pos.x, e.pos.z, 12, [0, 0.3, 0.1]);
    fx.dust.emit(e.pos.x, 0, e.pos.z, 3, { spread: 6, up: 1.5, out: 6, size: 12, life: 2 });
  });
  events.on('collapse', e => rig.shake(e.topple ? 0.6 : 0.25));
  events.on('topple', () => rig.shake(1.6));
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
    if (game.state === 'play') {
      g.update(dt, input, rig);
      game.city.update(dt);
      game.fx.debris.update(dt);
    }
    if (game.state !== 'pause') {
      game.fx.dust.update(dt, camera, renderer.domElement.height);
      game.fx.fire.update(dt, camera, renderer.domElement.height);
      seeThrough.uTime.value += dt;
    }
    else if (game.state === 'title') g.mixer.update(dt);
    if (game.state !== 'pause') rig.update(dt, g.position, game.state === 'play' ? input : IDLE);
    seeThrough.uCam.value.copy(camera.position);
    seeThrough.uFocus.value.copy(g.position).setY(40);
    moon.position.copy(g.position).add(MOON_OFS);
    moon.target.position.copy(g.position);
    FILL_OFS.copy(camera.position).sub(g.position).addScaledVector(rig.right, -120);
    fill.position.copy(g.position).add(FILL_OFS);
    fill.target.position.copy(g.position);
    $('hp').style.width = g.hp + '%';
    $('en').style.width = g.energy + '%';
    if (game.city.destroyed !== shownDestroyed) $('destroyed').textContent = shownDestroyed = game.city.destroyed;
  }
  renderer.render(scene, camera);
  input.endFrame();
}
const IDLE = { zoom: 0 };
let shownDestroyed = -1;
game.step = step;

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!game.manual) step(dt);   // game.manual = true: nur noch game.step() von Hand (Tests)
}

show('loading');
load().catch(err => {
  console.error(err);
  $('loadtext').textContent = 'Fehler beim Laden: ' + err.message;
});
frame();
