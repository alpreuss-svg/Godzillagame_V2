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
    music: { level: ['1989', 'osaka'], boss: ['1989_boss', 'superx2'], final: ['1989_final', 'biollante'] },
    models: ['biollante'],
    final: 'biollante', finalModel: 'biollante',   // danach der Endgegner: Biollante (Rose, dann Bestie)
    finalGoal: b => b.form === 'rose'
      ? 'Biollante wächst aus dem Fluss: Ranken abschlagen, die Rose mit dem Atomstrahl verbrennen!'
      : 'Biollante erwacht: Atomstrahl auf den glühenden Kern in ihrer Brust!',
    bossGoal: boss => boss.dead ? 'Die Super-X2 ist besiegt' : boss.melted ? 'Der Fire Mirror ist geschmolzen – Atomstrahl auf die Super-X2!'
      : 'Überhitze den Fire Mirror mit dem Atomstrahl oder lass ein Hochhaus in Umeda auf die Super-X2 stürzen!',
    win: ['BIOLLANTE IST ERLÖST', 'Super-X2 und Biollante sind besiegt'],
  },
  1991: {
    key: '3',
    title: 'Sapporo 1991 – Godzilla gegen King Ghidorah',
    short: '1991 · King Ghidorah',
    city: 'Sapporo',
    // Sapporo: Hochhäuser am Bahnhof im Norden, quer durch die Stadt der lange Ōdōri-Park (eine ganze Blockreihe),
    // südlich davon das Vergnügungsviertel Susukino, ganz im Süden der Hafen an der Bucht
    layout: {
      seed: 1991, center: { x: -0.5, z: -2.2 }, towerR: 2.0, officeR: 4.2,
      parks: [{ i0: -6, i1: 6, j0: 0, j1: 0 }],
      zoneOf(i, j, city) {
        if (j === 0) return null;                                          // Ōdōri-Park
        const z = j * P;
        if (z > city.bayZ - 2 * P) return 'port';
        if (j >= 1) return 'neon';                                         // Susukino
        const d = Math.hypot(i * P - city.center.x, z - city.center.z) / P;
        return d < city.cfg.towerR ? 'tower' : d < city.cfg.officeR ? 'office' : 'mixed';
      },
    },
    start: city => [-2 * P, city.bayZ + 110],
    boss: 'ghidorah',
    bossName: 'KING GHIDORAH',
    models: ['ghidorah'],
    final: 'mecha', finalModel: 'ghidorah',       // danach Mecha-King Ghidorah
    music: { level: ['1991', 'sapporo'], boss: ['1991_boss', 'ghidorah'], final: ['1991_final', 'mecha'] },
    bossGoal: boss => boss.dead ? 'King Ghidorah ist besiegt'
      : 'Atomstrahl auf King Ghidorahs Köpfe – landet er, greif mit Klaue und Schwanz an! Hochhäuser fangen seine Strahlen ab.',
    finalGoal: () => 'Mecha-King Ghidorah: Atomstrahl auf den Mechanik-Kopf, aus den Fangklammern mit Strahl oder Kernpuls befreien!',
    win: ['SAPPORO IST GERETTET', 'King Ghidorah und Mecha-King Ghidorah sind besiegt'],
  },
};

export function currentLevel() {
  const id = new URLSearchParams(location.search).get('level');
  return LEVELS[id] ? id : '1984';
}
