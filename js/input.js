// Tastatur und Gamepad -> einheitliche Aktionen (down = gehalten, pressed = in diesem Frame gedrückt)

const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'claw', KeyK: 'breath', KeyL: 'roar', KeyR: 'pulse',
  Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
};
// Standard-Mapping, Xbox-Belegung: A Klaue, B Kernpuls, X Atomstrahl, Y Brüllen, Start Pause
const PAD = { 0: 'claw', 1: 'pulse', 2: 'breath', 3: 'roar', 9: 'pause' };
const DEAD = 0.18;

function dead(v) { return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); }

export class Input {
  constructor() {
    this.kb = new Set();
    this.pad = new Set();
    this.hit = new Set();
    this.any = false;
    this.move = { x: 0, y: 0 };
    this.zoom = 0;
    addEventListener('keydown', e => {
      this.any = true;
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat && !this.kb.has(a)) this.hit.add(a);
      this.kb.add(a);
    });
    addEventListener('keyup', e => { const a = KEYS[e.code]; if (a) this.kb.delete(a); });
    addEventListener('blur', () => this.kb.clear());
    addEventListener('pointerdown', () => { this.any = true; });
    addEventListener('wheel', e => { this.zoom += Math.sign(e.deltaY); }, { passive: true });
  }

  down(a) { return this.kb.has(a) || this.pad.has(a); }
  pressed(a) { return this.hit.has(a); }

  update() {
    let sx = 0, sy = 0;
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (gp) {
      for (const [i, a] of Object.entries(PAD)) {
        const b = gp.buttons[i];
        const on = !!b && (b.pressed || b.value > 0.5);
        if (on && !this.pad.has(a)) { this.hit.add(a); this.any = true; }
        if (on) this.pad.add(a); else this.pad.delete(a);
      }
      sx = dead(gp.axes[0] || 0); sy = -dead(gp.axes[1] || 0);
    }
    let x = sx + (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let y = sy + (this.down('up') ? 1 : 0) - (this.down('down') ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
  }

  endFrame() { this.hit.clear(); this.any = false; this.zoom = 0; }
}
