// Touch-Steuerung für Handy und Tablet (wie in Teil 1): links ein Steuerkreis – solange der Punkt im Kreis bleibt,
// geht Godzilla normal, zieht man ihn über den Rand hinaus, sprintet er. Rechts vier Knöpfe (Schlag, Strahl, Puls,
// Brüll), oben Pause und Ton. Erscheint nur auf Geräten mit Touch.
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const BUTTONS = [
  ['pulse', 'PULS', '#ff7a3a'], ['roar', 'BRÜLL', '#7dff8a'],
  ['breath', 'STRAHL', '#4aa8ff'], ['claw', 'SCHLAG', '#ffd23a'],
];
const SPRINT_AT = 1.12;          // ab diesem Vielfachen des Kreisradius wird gesprintet
const MAX_PULL = 1.7;            // so weit folgt der Punkt dem Finger über den Rand hinaus

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.held = new Set();
    this.move = { x: 0, y: 0 };
    this.stick = null;            // { id, cx, cy }
    const root = this.root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `<div class="stick"><i></i></div>
      <div class="btns">${BUTTONS.map(([a, t, c]) => `<button data-a="${a}" style="--c:${c}">${t}</button>`).join('')}</div>
      <button class="sys pause" data-a="pause">❚❚</button><button class="sys mute" data-a="mute">♪</button>`;
    document.body.appendChild(root);
    this.base = root.querySelector('.stick');
    this.knob = root.querySelector('.stick i');
    // Knöpfe: gedrückt halten (Strahl), Antippen löst einmal aus
    for (const b of root.querySelectorAll('button')) {
      const a = b.dataset.a;
      const on = e => { e.preventDefault(); e.stopPropagation(); this.input.any = true;
        if (!this.held.has(a)) this.input.hit.add(a); this.held.add(a); b.classList.add('on'); b.setPointerCapture?.(e.pointerId); };
      const off = e => { e.preventDefault(); this.held.delete(a); b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    }
    // Steuerkreis: jeder Finger in der linken Bildschirmhälfte steuert, bezogen auf die Kreismitte
    addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || this.stick || e.clientX > innerWidth * 0.45 || e.target.closest?.('button, #levels')) return;
      const r = this.base.getBoundingClientRect();
      this.stick = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 };
      this.drag(e);
    });
    addEventListener('pointermove', e => { if (this.stick && e.pointerId === this.stick.id) this.drag(e); });
    const end = e => { if (this.stick && e.pointerId === this.stick.id) this.release(); };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    addEventListener('blur', () => { this.release(); this.held.clear(); });
  }

  drag(e) {
    const s = this.stick;
    let dx = e.clientX - s.cx, dy = e.clientY - s.cy;
    const d = Math.hypot(dx, dy), k = d / s.R;
    this.sprint = k > SPRINT_AT;
    const m = Math.min(1, k) / Math.max(d, 1e-3);
    this.move.x = dx * m; this.move.y = -dy * m;              // nach oben ziehen = Norden
    if (k > MAX_PULL) { dx *= MAX_PULL / k; dy *= MAX_PULL / k; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.base.classList.toggle('sprint', this.sprint);
    this.base.classList.add('on');
  }

  release() {
    this.stick = null; this.sprint = false; this.move.x = this.move.y = 0;
    this.knob.style.transform = '';
    this.base.classList.remove('sprint', 'on');
  }

  down(a) { return this.held.has(a) || (a === 'sprint' && this.sprint); }
  set visible(v) { this.root.hidden = !v; }
}

// Vollbild und Querformat beim ersten Antippen (Browser erlauben das nur nach einer Berührung)
export function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
