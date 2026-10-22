// Einstieg: Renderer, Nachtstimmung, Laden, Spielzustände und Hauptschleife
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Godzilla } from './godzilla.js';
import { City, BAY_Z } from './city.js';
import { Particles, Debris } from './effects.js';
import { seeThrough } from './buildings.js';
import { Military } from './military.js';
import { SuperX } from './boss.js';
import { Atmosphere } from './atmosphere.js';
import { Sound, Music } from './audio.js';

// Qualität: ?q=low für schwache Grafik (z. B. Intel UHD 615), ?q=high für mehr Kantenglättung/Schatten
const Q = new URLSearchParams(location.search).get('q') || 'mid';
const QUALITY = {
  low: { ratio: 1, aa: false, shadow: 512, dust: 500, fire: 250, rain: 400, fireLights: 2 },
  mid: { ratio: 1.25, aa: true, shadow: 1024, dust: 1000, fire: 500, rain: 1200, fireLights: 4 },
  high: { ratio: 2, aa: true, shadow: 2048, dust: 1600, fire: 800, rain: 2000, fireLights: 6 },
}[Q] || { ratio: 1.25, aa: true, shadow: 1024, dust: 1000, fire: 500, rain: 1200, fireLights: 4 };

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
  for (const s of ['loading', 'title', 'paused', 'over']) $(s).hidden = s !== id;
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
  game.military = new Military(units, scene, fx, events);
  game.boss = new SuperX(units, scene, fx, events, game.military);
  game.atmo = new Atmosphere(scene, { rain: QUALITY.rain, fireLights: QUALITY.fireLights });
  const g = game.godzilla = new Godzilla(gz, scene, events);
  g.position.set(-1200, 0, BAY_Z + 200);      // kommt im Südwesten der Karte aus der Bucht
  g.raycast = (o, d, max) => game.city.raycast(o, d, max);
  g.collide = (c, r, dt) => game.city.crush(c, r, dt);
  g.aimTargets = () => game.military.targets().concat(game.boss.targets());
  rig.snap(g.position);

  // Treffer-Effekte (Brocken, Staub, Brände) erzeugt die Stadt selbst am Einschlagpunkt
  events.on('attack', e => {
    game.city.damage(e.pos, e.radius, e.damage, e.from, e.falloff, e.height ?? e.pos.y, e.hitSet);
    if (e.kind !== 'beam') game.military.damage(e.pos, e.kind === 'claw' ? e.radius + 12 : e.radius, e.damage, e.from);
    if (e.kind === 'beam' && e.pos.y < 3 && Math.random() < 0.5) game.city.scars.burn(e.pos.x, e.pos.z, 9);
    if (e.kind === 'pulse') game.city.scars.scorch(e.pos.x, e.pos.z, e.radius * 0.9, 0.6);
  });
  events.on('beamLine', e => { game.military.damageLine(e.from, e.to, 14, e.dps * e.dt); game.boss.beamLine(e.from, e.to, e.dt); });
  events.on('stomp', e => {
    rig.shake(0.35 * e.strength);
    game.military.damage(e.pos, 16, 999, e.pos);
    game.city.damage(e.pos, 14, 60, e.pos, false, 3);
    game.city.decals.add('impact', e.pos.x, e.pos.z, Math.random() * 6.3, 16 + Math.random() * 10);
    game.city.scars.blob(e.pos.x, e.pos.z, 12, [0, 0.3, 0.1]);
    fx.dust.emit(e.pos.x, 0, e.pos.z, 3, { spread: 6, up: 1.5, out: 6, size: 12, life: 2 });
  });
  events.on('collapse', e => rig.shake(e.topple ? 0.6 : 0.25));
  events.on('topple', () => rig.shake(1.6));
  events.on('roar', () => rig.shake(1.0));
  events.on('shake', a => rig.shake(a));
  events.on('death', () => { game.endT = 4; game.result = 'lost'; Sound.breath(false); Music.play('over'); });
  events.on('bossStart', () => { cinema('SUPER-X', 4.5); $('boss').hidden = false; Music.play('boss'); Sound.sfx('siren'); });
  events.on('cadmiumWarning', () => toast('KADMIUM-RAKETEN!', 2));
  events.on('cadmium', () => toast('Godzilla ist betäubt', 2.5));
  events.on('bossHit', () => toast('Volltreffer!', 1.5));
  events.on('bossCrash', () => { game.result = 'won'; game.endT = 5; $('boss').hidden = true; cinema('DIE SUPER-X IST BESIEGT', 4); Sound.sfx('boom', true); Music.play('win'); });
  hookSounds();

  game.state = 'title';
  show('title');
}

// Ein Spielschritt; game.step(dt) lässt sich auch von Hand aufrufen (Tests ohne sichtbares Fenster)
function step(dt) {
  input.update();
  const g = game.godzilla;

  if (game.state === 'title' && input.any) {
    game.state = 'play'; show(null);
    Sound.init(); Music.play('level'); Sound.sfx('siren');          // Ton erst nach der ersten Taste (Browser-Regel)
  }
  if (input.pressed('mute')) Music.mute(Sound.toggleMute());
  else if (game.state === 'over' && (game.overT += dt) > 1.5 && input.any) location.reload();   // neues Spiel
  else if (game.state === 'play' && input.pressed('pause')) { game.state = 'pause'; show('paused'); }
  else if (game.state === 'pause' && input.pressed('pause')) { game.state = 'play'; show(null); }

  if (g) {
    if (game.state === 'play') {
      game.stats.time += dt;
      if (game.endT > 0 && (game.endT -= dt) <= 0) endGame();
      g.update(dt, input, rig);
      game.city.update(dt);
      if (!game.boss.active && !game.boss.dead && game.city.destroyed >= BOSS_AT) game.boss.start(g.position);
      if (!game.boss.active && !game.boss.dead) game.military.updateWaves(dt, g.position, game.city.destroyed);
      game.military.update(dt, g, game.city);
      game.boss.update(dt, g);
      $('bossHp').style.width = game.boss.hp + '%';
      for (const k of ['cinemaT', 'toastT']) if (game[k] > 0 && (game[k] -= dt) <= 0) $(k === 'cinemaT' ? 'cinema' : 'toast').classList.remove('on');
      game.fx.debris.update(dt);
    }
    if (game.state === 'title') g.mixer.update(dt);
    if (game.state !== 'pause') {
      game.fx.dust.update(dt, camera, renderer.domElement.height);
      game.fx.fire.update(dt, camera, renderer.domElement.height);
      game.atmo.update(dt, camera, g, game.city, rig.target);
      seeThrough.uTime.value += dt;
    }
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
    if (game.military.destroyed !== shownUnits) $('units').textContent = shownUnits = game.military.destroyed;
    const obj = objective();
    if (obj !== shownObjective) $('objective').textContent = shownObjective = obj;
  }
  renderer.render(scene, camera);
  input.endFrame();
}
const IDLE = { zoom: 0 };
let shownDestroyed = -1, shownUnits = -1, shownObjective = '';
game.stats = { time: 0 };
game.endT = 0;
game.overT = 0;
const BOSS_AT = 120;          // zerstörte Gebäude, ab denen die Super-X angreift

function objective() {
  const d = game.city.destroyed;
  if (d < BOSS_AT) return `Ziel: Verwüste Tokio (${d} / ${BOSS_AT})`;
  return game.boss.dead ? 'Die Super-X ist besiegt' : 'Lass ein Hochhaus auf die Super-X stürzen!';
}

// Spielende: Bilanz anzeigen, Taste startet neu
function endGame() {
  game.state = 'over';
  game.overT = 0;
  const won = game.result === 'won';
  $('overTitle').textContent = won ? 'TOKIO LIEGT IN TRÜMMERN' : 'GODZILLA FÄLLT';
  $('overSub').textContent = won ? 'Die Super-X ist besiegt' : 'Die Selbstverteidigungsstreitkräfte haben gesiegt';
  const t = game.stats.time, mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  const rows = [['Zeit', `${mm}:${String(ss).padStart(2, '0')}`], ['Gebäude zerstört', game.city.destroyed],
    ['Einheiten zerstört', game.military.destroyed]];
  if (won) rows.push(['Bewertung', rating()]);
  $('overStats').innerHTML = rows.map(([a, b]) => `<tr><td>${b}</td><td>${a}</td></tr>`).join('');
  show('over');
}

// Bewertung nach Zerstörung pro Minute und verbliebenem Leben
function rating() {
  const g = game.godzilla, perMin = (game.city.destroyed + game.military.destroyed * 2) / Math.max(1, game.stats.time / 60);
  const score = perMin * 0.6 + g.hp * 0.4;
  return score > 90 ? 'S – König der Monster' : score > 65 ? 'A – Zerstörer' : score > 40 ? 'B – Bedrohung' : 'C – Ausreißer';
}
game.endGame = endGame;

// Geräusche zu den Spielereignissen; häufige Ereignisse werden gedrosselt, damit es kein Lärmbrei wird
function hookSounds() {
  const last = {};
  const once = (key, gap, fn) => { const t = performance.now(); if (t - (last[key] || 0) > gap * 1000) { last[key] = t; fn(); } };
  events.on('roar', () => Sound.sfx('roar', { kind: 'godzilla' }));
  events.on('charge', e => Sound.sfx('charge', Math.max(0.2, e.dur)));
  events.on('breath', e => Sound.breath(e.on));
  events.on('swing', e => Sound.sfx(e.kind === 'tail' ? 'whip' : 'swing'));
  events.on('stomp', () => Sound.sfx('stomp'));
  events.on('attack', e => { if (e.kind === 'pulse') { Sound.sfx('boom', true); Sound.sfx('zap'); } });
  events.on('collapse', e => once('collapse', 0.25, () => Sound.sfx('collapse', e.b.h)));
  events.on('topple', () => Sound.sfx('heavy'));
  events.on('unitDestroyed', () => once('boom', 0.15, () => Sound.sfx('boom', false)));
  events.on('shot', () => once('shot', 0.12, () => Sound.sfx('shot')));
  events.on('hurt', () => once('hurt', 0.4, () => Sound.sfx('hurt')));
  events.on('cadmiumWarning', () => Sound.sfx('alarm'));
  events.on('cadmium', () => Sound.sfx('hit'));
  events.on('bossHit', () => Sound.sfx('boom', true));
}

function cinema(text, sec) { $('cinemaText').textContent = text; $('cinema').classList.add('on'); game.cinemaT = sec; }
function toast(text, sec) { $('toast').textContent = text; $('toast').classList.add('on'); game.toastT = sec; }
game.step = step;

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!game.manual) step(dt);   // game.manual = true: nur noch game.step() von Hand (Tests)
}

// Filmkorn: Rauschkachel einmal erzeugen
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

show('loading');
load().catch(err => {
  console.error(err);
  $('loadtext').textContent = 'Fehler beim Laden: ' + err.message;
});
frame();
