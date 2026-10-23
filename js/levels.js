// Level je Film der Heisei-Ära: Stadtplan, Start, Boss, Musik und Texte. Gewählt per ?level=1989 bzw. im Titelbild (1, 2).
import { P } from './city.js';

export const LEVELS = {
  1984: {
    key: '1',
    title: 'Tokio 1984 – Die Rückkehr',
    short: '1984 · Die Rückkehr',
    city: 'Tokio',
    layout: {},                                   // DEFAULT_LAYOUT aus city.js
    start: city => [-3 * P, city.bayZ + 110],      // kommt im Südwesten aus der Bucht
    boss: 'superx',
    bossName: 'SUPER-X',
    music: { level: ['1984', 'tokyo'], boss: ['1984_boss', 'superx'] },
    bossGoal: () => 'Locke die Super-X nach Shinjuku und lass ein Hochhaus auf sie stürzen!',
    win: ['TOKIO LIEGT IN TRÜMMERN', 'Die Super-X ist besiegt'],
  },
  1989: {
    key: '2',
    title: 'Osaka 1989 – Godzilla gegen Biollante',
    short: '1989 · Biollante',
    city: 'Osaka',
    // Osaka: Hochhäuser in Umeda nördlich des Flusses, der Fluss (Dōjima/Tosabori) quer durch die Stadt,
    // südlich davon das Vergnügungsviertel Dōtonbori (kleine Läden dicht an dicht), östlich der Burgpark, im Süden der Hafen
    layout: {
      seed: 1989, center: { x: 0.5, z: -1.6 }, towerR: 2.1, officeR: 4.0,
      rivers: [{ z0: 1 * P - 62, z1: 1 * P + 62 }],
      parks: [{ i0: 3, i1: 4, j0: -3, j1: -2 }],
      zoneOf(i, j, city) {
        if (j === 1) return null;                                          // Fluss
        if (i >= 3 && i <= 4 && j >= -3 && j <= -2) return null;           // Burgpark
        const z = j * P;
        if (z > city.bayZ - 2 * P) return 'port';
        if (j >= 2) return 'neon';                                         // Dōtonbori
        const d = Math.hypot(i * P - city.center.x, z - city.center.z) / P;
        return d < city.cfg.towerR ? 'tower' : d < city.cfg.officeR ? 'office' : 'mixed';
      },
    },
    start: city => [-2 * P, city.bayZ + 110],
    boss: 'superx2',
    bossName: 'SUPER-X2',
    music: { level: ['1989', 'osaka'], boss: ['1989_boss', 'superx2'] },
    bossGoal: boss => boss.melted ? 'Der Fire Mirror ist geschmolzen – Atomstrahl auf die Super-X2!'
      : 'Überhitze den Fire Mirror mit dem Atomstrahl oder lass ein Hochhaus in Umeda auf die Super-X2 stürzen!',
    win: ['OSAKA LIEGT IN TRÜMMERN', 'Die Super-X2 ist besiegt'],
  },
};

export function currentLevel() {
  const id = new URLSearchParams(location.search).get('level');
  return LEVELS[id] ? id : '1984';
}
