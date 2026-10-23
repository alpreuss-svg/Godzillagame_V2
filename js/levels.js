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
    finalGoal: () => 'Mecha-King Ghidorah: Atomstrahl auf den Mechanik-Kopf – aus den Greifhaken befreit nur der Kernpuls!',
    win: ['SAPPORO IST GERETTET', 'King Ghidorah und Mecha-King Ghidorah sind besiegt'],
  },
  1992: {
    key: '4',
    title: 'Yokohama 1992 – Godzilla gegen Mothra',
    short: '1992 · Mothra',
    city: 'Yokohama',
    // Yokohama: Minato Mirai am Wasser mit dem Landmark Tower, das Riesenrad Cosmo Clock am Hafen, westlich davon
    // Chinatown (eng, `neon`), der Yamashita-Park am Ufer, dahinter Büros und Wohnviertel
    layout: {
      seed: 1992, center: { x: 1.5, z: 1.4 }, towerR: 1.7, officeR: 3.8,
      parks: [{ i0: -1, i1: 0, j0: 3, j1: 3 }],
      specials: [{ type: 'landmark', i: 2, j: 1 }, { type: 'wheel', i: 3, j: 3 }],
      zoneOf(i, j, city) {
        if (i >= -1 && i <= 0 && j === 3) return null;                    // Yamashita-Park
        const z = j * P;
        if (z > city.bayZ - 2 * P) return 'port';
        if (i <= -2 && i >= -4 && j >= 0) return 'neon';                    // Chinatown
        const d = Math.hypot(i * P - city.center.x, z - city.center.z) / P;
        return d < city.cfg.towerR ? 'tower' : d < city.cfg.officeR ? 'office' : 'mixed';
      },
    },
    start: city => [-4 * P, city.bayZ + 110],
    boss: 'battra',
    bossName: 'BATTRA – LARVE',
    models: ['mothra'],
    final: 'mothra', finalModel: 'mothra',
    music: { level: ['1992', 'yokohama'], boss: ['1992_boss', 'battra'], final: ['1992_final', 'mothra'] },
    bossGoal: boss => boss.dead ? 'Battra ist besiegt' : boss.form === 'imago'
      ? 'Battra fliegt: Atomstrahl auf sie – stürzt sie sich herab, greif mit Klaue und Schwanz an!'
      : 'Die Battra-Larve kriecht aus der Bucht: Atomstrahl, Klaue und Schwanz – weich ihrem Horn aus!',
    finalGoal: () => 'Mothra: Atomstrahl, wenn kein Schuppenpulver glitzert – der Schrei (L) bläst es weg! Beim Flügelsturm ist sie tief genug für Klaue und Schwanz.',
    win: ['YOKOHAMA GEHÖRT GODZILLA', 'Battra und Mothra sind besiegt'],
  },
  1993: {
    key: '5',
    title: 'Makuhari 1993 – Godzilla gegen Mechagodzilla',
    short: '1993 · Mechagodzilla',
    city: 'Makuhari',
    // Makuhari (Chiba): Bürotürme des neuen Zentrums, die Messehallen am Wasser, Strandpark an der Bucht, Hafen
    layout: {
      seed: 1993, center: { x: 0.5, z: 0.4 }, towerR: 1.8, officeR: 3.9,
      parks: [{ i0: -5, i1: -3, j0: 3, j1: 3 }],
      specials: [{ type: 'messe', i: -1, j: 2 }, { type: 'messe', i: 0, j: 2 }, { type: 'messe', i: 1, j: 2 }],
      zoneOf(i, j, city) {
        if (i >= -5 && i <= -3 && j === 3) return null;                   // Strandpark
        const z = j * P;
        if (z > city.bayZ - 2 * P) return 'port';
        const d = Math.hypot(i * P - city.center.x, z - city.center.z) / P;
        return d < city.cfg.towerR ? 'tower' : d < city.cfg.officeR ? 'office' : 'mixed';
      },
    },
    start: city => [-3 * P, city.bayZ + 110],
    boss: 'rodan',
    bossName: 'RODAN',
    models: ['kaiju93'],
    final: 'mechag', finalModel: 'kaiju93',
    music: { level: ['1993', 'makuhari'], boss: ['1993_boss', 'rodan'], final: ['1993_final', 'gforce'] },
    bossGoal: boss => boss.dead ? 'Rodan ist besiegt' : boss.fire
      ? 'Fire Rodan glüht: Atomstrahl – stürzt er herab, Klaue und Schwanz!'
      : 'Rodan greift aus der Luft an: Atomstrahl, und im Sturzflug Klaue und Schwanz!',
    finalGoal: () => 'Mechagodzilla: von vorn saugt er den Strahl auf – greif ihn von hinten an (zweites Gehirn)! Aus den Schockankern befreit nur der Kernpuls.',
    win: ['MECHAGODZILLA IST ZERSTÖRT', 'Rodan und Mechagodzilla sind besiegt'],
  },
  1994: {
    key: '6',
    title: 'Fukuoka 1994 – Godzilla gegen SpaceGodzilla',
    short: '1994 · SpaceGodzilla',
    city: 'Fukuoka',
    // Fukuoka: Hochhäuser in Tenjin, der Fukuoka Tower (234 m) am Wasser von Momochi, der Ōhori-Park, Hafen Hakata
    layout: {
      seed: 1994, center: { x: -0.6, z: -0.4 }, towerR: 2.0, officeR: 4.0,
      parks: [{ i0: -4, i1: -3, j0: -2, j1: -1 }],
      specials: [{ type: 'ftower', i: 2, j: 3 }],
      zoneOf(i, j, city) {
        if (i >= -4 && i <= -3 && j >= -2 && j <= -1) return null;          // Ōhori-Park
        const z = j * P;
        if (z > city.bayZ - 2 * P) return 'port';
        const d = Math.hypot(i * P - city.center.x, z - city.center.z) / P;
        return d < city.cfg.towerR ? 'tower' : d < city.cfg.officeR ? 'office' : 'mixed';
      },
    },
    start: city => [-3 * P, city.bayZ + 110],
    boss: 'moguera',
    bossName: 'MOGUERA',
    models: ['kaiju94'],
    final: 'spaceg', finalModel: 'kaiju94',
    music: { level: ['1994', 'fukuoka'], boss: ['1994_boss', 'moguera'], final: ['1994_final', 'spaceg'] },
    bossGoal: boss => boss.dead ? 'Moguera ist besiegt' : 'Moguera: Atomstrahl, Klaue und Schwanz – gräbt er sich ein, weich der Staubspur aus!',
    finalGoal: f => f.towerUp()
      ? 'SpaceGodzilla zieht Kraft aus dem Fukuoka Tower: zerstöre den Turm (am Wasser) und die Kristalltürme!'
      : 'Der Energiestrom ist unterbrochen – greif SpaceGodzilla an! Aus dem Sog befreit nur der Kernpuls.',
    win: ['SPACEGODZILLA IST BESIEGT', 'Moguera und SpaceGodzilla sind besiegt'],
  },
};

export function currentLevel() {
  const id = new URLSearchParams(location.search).get('level');
  return LEVELS[id] ? id : '1984';
}
