// Mini-Map oben rechts: Land, Bucht, Gebäude (Hochhäuser heller, zerstörte rot), Godzilla als Pfeil, Militär, Super-X.
// Die Gebäudeschicht wird nur neu gezeichnet, wenn sich die Zerstörung geändert hat.


export class MiniMap {
  constructor(canvas, city) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.city = city;
    this.bayZ = city.bayZ;
    this.shinjuku = city.center;
    this.half = city.extent + 120;     // dargestellter Ausschnitt: die ganze Stadt samt Rand und Bucht
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = canvas.width;
    this.drawn = -1;
    this.wait = 0;
  }

  px(v) { return (v / this.half * 0.5 + 0.5) * this.c.width; }

  drawBase() {
    const g = this.base.getContext('2d'), S = this.base.width, s = S / (2 * this.half);
    g.fillStyle = '#16191f'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#0d2236'; g.fillRect(0, this.px(this.bayZ), S, S);          // Bucht
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;                // Shinjuku
    g.beginPath(); g.arc(this.px(this.shinjuku.x), this.px(this.shinjuku.z), this.city.cfg.towerR * 136 * s, 0, Math.PI * 2); g.stroke();
    for (const b of this.city.buildings) {
      const w = Math.max(1, b.hw * 2 * s), d = Math.max(1, b.hd * 2 * s);
      g.fillStyle = b.alive ? (b.h > 70 ? '#c9d2de' : b.h > 25 ? '#7d8896' : '#4d5662') : b.ruin ? '#7a3a22' : '#5a2418';
      g.fillRect(this.px(b.x) - w / 2, this.px(b.z) - d / 2, w, d);
    }
    this.drawn = this.city.destroyed;
  }

  update(dt, g, military, boss) {
    this.wait -= dt;
    if (this.drawn !== this.city.destroyed && this.wait <= 0) { this.drawBase(); this.wait = 0.5; }
    const ctx = this.g, S = this.c.width;
    ctx.drawImage(this.base, 0, 0);
    ctx.fillStyle = '#ff4a3a';
    for (const u of military.units) ctx.fillRect(this.px(u.mesh.position.x) - 1.5, this.px(u.mesh.position.z) - 1.5, 3, 3);
    if (boss.active) {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.arc(this.px(boss.mesh.position.x), this.px(boss.mesh.position.z), 4, 0, Math.PI * 2); ctx.fill();
    }
    // Godzilla: Pfeil in Blickrichtung
    const x = this.px(g.position.x), y = this.px(g.position.z), h = g.heading;
    const fx = Math.sin(h), fy = Math.cos(h);
    ctx.fillStyle = '#7fd0ff';
    ctx.beginPath();
    ctx.moveTo(x + fx * 7, y + fy * 7);
    ctx.lineTo(x - fx * 4 + fy * 4, y - fy * 4 - fx * 4);
    ctx.lineTo(x - fx * 4 - fy * 4, y - fy * 4 + fx * 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}
