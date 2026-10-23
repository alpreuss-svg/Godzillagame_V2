/* Audio aus Teil 1 (js/audio.js), als ES-Modul übernommen und um düstere Heisei-Stücke ergänzt:
   Orchester-Synth (Blechbläser, Streicher, Kontrabass-Ostinato, Pauken, Militärtrommel), physikalisch modellierter
   Schrei (gestrichene Saite) und Geräuscheffekte. Alle Stücke sind Eigenkompositionen -> lizenzfrei, nichts wird geladen.
   Dazu der Musikmanager: eigene Dateien aus music/ haben Vorrang, sonst spielt das passende Synth-Stück. */
export const Sound = (function () {
  var ctx = null, master, music, sfx, verb, noiseBuf, muted = false;
  var song = null, songEvents = null, step = 0, nextTime = 0, timer = null, songName = '';
  var breathNode = null, volM = 0.7, volS = 0.8;
  function setVol(m, s) {
    volM = m; volS = s;
    if (music) music.gain.value = 0.72 * m;
    if (sfx) sfx.gain.value = 0.9 * s;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    comp.connect(master); master.connect(ctx.destination);
    music = ctx.createGain(); music.connect(comp);
    sfx = ctx.createGain(); sfx.connect(comp);
    setVol(volM, volS);
    // Hall (künstliche Impulsantwort)
    verb = ctx.createConvolver();
    var len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir;
    var vg = ctx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(comp);
    setTimeout(function () { Object.keys(ROARS).forEach(function (k) { makeRoar(k); }); }, 300);
    loadRoarFiles();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  function out(node, wet) {
    node.connect(music);
    if (wet) { var g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(verb); }
  }

  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(tok) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(tok);
    if (!m) return 0;
    var n = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  /* ---------- Instrumente ---------- */
  function brass(f, t, dur, vol) {
    var g = ctx.createGain(), fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.Q.value = 2;
    fl.frequency.setValueAtTime(350, t); fl.frequency.linearRampToValueAtTime(2600, t + 0.07); fl.frequency.linearRampToValueAtTime(1500, t + 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.06, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
    [-5, 5].forEach(function (cents) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
      if (dur > 0.4) { var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.4); lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.2); }
      o.connect(fl); o.start(t); o.stop(t + dur + 0.2);
    });
    fl.connect(g); out(g, 0.5);
  }
  function strings(fs, t, dur, vol) {
    var g = ctx.createGain(), fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.18);
    g.gain.setValueAtTime(vol, t + Math.max(0.2, dur - 0.1)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.35);
    var lfo = ctx.createOscillator(); lfo.frequency.value = 5.6; lfo.start(t); lfo.stop(t + dur + 0.4);
    fs.forEach(function (f) {
      [-9, 0, 9].forEach(function (cents) {
        var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
        var lg = ctx.createGain(); lg.gain.value = f * 0.004; lfo.connect(lg); lg.connect(o.frequency);
        o.connect(fl); o.start(t); o.stop(t + dur + 0.4);
      });
    });
    fl.connect(g); out(g, 0.7);
  }
  function low(f, t, dur, vol) { // Kontrabass/Klavier-Ostinato
    var g = ctx.createGain(), fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(1400, t); fl.frequency.exponentialRampToValueAtTime(380, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + Math.min(dur, 0.4)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f / 2;
    o.connect(fl); o2.connect(fl); fl.connect(g); out(g, 0.2);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function timp(f, t, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.06, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    o.connect(g); out(g, 0.6); o.start(t); o.stop(t + 1.4);
    var o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.type = 'sine'; o2.frequency.value = f * 1.5;
    g2.gain.setValueAtTime(vol * 0.3, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o2.connect(g2); out(g2, 0.4); o2.start(t); o2.stop(t + 0.6);
    noiseHit(t, 0.08, 'lowpass', 400, vol * 0.6, music);
  }
  function noiseHit(t, len, type, fr, vol, dest, wet) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = fr;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f); f.connect(g);
    if (dest === music) out(g, wet || 0.3); else g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }
  function perc(k, t) {
    if (k === 'k') { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); out(g, 0.3); o.start(t); o.stop(t + 0.4); }
    else if (k === 's') { noiseHit(t, 0.16, 'bandpass', 1900, 0.45, music, 0.4); }
    else if (k === 'r') { for (var i = 0; i < 4; i++) noiseHit(t + i * 0.03, 0.05, 'bandpass', 2100, 0.22, music, 0.4); }
    else if (k === 'c') { noiseHit(t, 1.4, 'highpass', 5000, 0.28, music, 0.8); }
  }

  /* ---------- Stücke (16 Schritte = 1 Takt) ---------- */
  function R(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' '); }
  function bar(ch) { return ch + R(' -', 15); }
  function ost(r1, r2) { return R(r1 + ' ' + r1 + ' ' + r2 + ' ' + r1, 4); }
  function pad(list) { return list.map(bar).join(' '); }

  var SONGS = {
    title: {
      bpm: 76, loop: true,
      brass: 'D4 - - - - - - - A4 - - - - - - - ' + 'G4 - - - F4 - - - E4 - - - F4 - D4 - ' +
        'F4 - - - - - - - D5 - - - - - C5 - ' + 'C#5 - - - - - - - A4 - - - - - - - ' +
        'D5 - - - - - - - F5 - - - - - E5 - ' + 'D5 - - - - - Bb4 - G4 - - - - - A4 - ' +
        'E5 - - - - - D5 - C#5 - - - - - E4 - ' + 'D4 - - - - - - - - - - - . . . .',
      str: pad(['D3+F3+A3', 'D3+F3+A3', 'Bb2+D3+F3', 'A2+C#3+E3', 'D3+F3+A3', 'G2+Bb2+D3', 'A2+C#3+E3', 'D3+F3+A3']),
      low: R('D2 - . D2 D2 - . D2 D2 - . D2 C#2 - D2 -', 2) + ' Bb1 - . Bb1 Bb1 - . Bb1 Bb1 - . Bb1 A1 - Bb1 - ' +
        'A1 - . A1 A1 - . A1 A1 - . A1 G#1 - A1 - ' + 'D2 - . D2 D2 - . D2 D2 - . D2 C#2 - D2 - ' +
        'G1 - . G1 G1 - . G1 G1 - . G1 F#1 - G1 - ' + 'A1 - . A1 A1 - . A1 A1 - . A1 G#1 - A1 - ' + 'D2 - . D2 D2 - . D2 D2 - - - . . . .',
      timp: R('D2 . . . . . . . A1 . . . . . . .', 3) + ' A1 . . . . . . . A1 . . . A1 . A1 . ' + R('D2 . . . . . . . A1 . . . . . . .', 2) + ' A1 . . . A1 . . . A1 . A1 . A1 A1 A1 A1 D2 . . . . . . . . . . . . . . .',
      perc: 'c . . . . . . . s . . . . . . . ' + R('k . . . . . . . s . . . . . . .', 6) + ' k . . . . . . . r r r r r r r r'
    },
    stage: {
      bpm: 132, loop: true,
      brass: 'A4 - . A4 C5 - . A4 E5 - - - D5 - C5 - ' + 'B4 - . G4 A4 - - - . . . . E4 - G4 - ' +
        'A4 - . A4 C5 - . A4 F5 - - - E5 - C5 - ' + 'D5 - - - B4 - G4 - D5 - - - E5 - D5 - ' +
        'C5 - - - A4 - - - E5 - - - A5 - - - ' + 'G5 - F5 - E5 - D5 - C5 - B4 - C5 - D5 - ' +
        'C5 - - - A4 - - - F5 - - - E5 - D5 - ' + 'E5 - - - - - - - G#4 - - - B4 - - -',
      str: pad(['A3+C4+E4', 'A3+C4+E4', 'F3+A3+C4', 'G3+B3+D4', 'A3+C4+E4', 'A3+C4+E4', 'F3+A3+C4', 'E3+G#3+B3']),
      low: [ost('A1', 'A2'), ost('A1', 'A2'), ost('F1', 'F2'), ost('G1', 'G2'), ost('A1', 'A2'), ost('A1', 'A2'), ost('F1', 'F2'), ost('E1', 'E2')].join(' '),
      timp: R('A1 . . . . . . . E1 . . . . . . .', 2) + ' F1 . . . . . . . C2 . . . . . . . G1 . . . . . . . D2 . . . . . . . ' + R('A1 . . . . . . . E1 . . . . . . .', 2) + ' F1 . . . . . . . C2 . . . . . . . E1 . . . E1 . . . E1 . E1 . E1 E1 E1 E1',
      perc: 'c . s . k . s . k . s . k k s . ' + R('k . s . k . s . k . s . k k s s', 6) + ' k . s . k . s . r r r r r r r r'
    },
    mini: {
      bpm: 144, loop: true,
      brass: 'C5 - - - G4 - - - C5 - Eb5 - D5 - C5 - ' + 'G4 - - - - - - - . . . . G4 - Ab4 - ' +
        'Ab4 - - - C5 - - - Eb5 - - - D5 - C5 - ' + 'B4 - - - - - - - D5 - - - G4 - - -',
      str: pad(['C3+Eb3+G3', 'C3+Eb3+G3', 'Ab2+C3+Eb3', 'G2+B2+D3']),
      low: [ost('C2', 'C3'), ost('C2', 'C3'), ost('Ab1', 'Ab2'), ost('G1', 'G2')].join(' '),
      timp: R('C2 . . . C2 . . . G1 . . . C2 . G1 .', 3) + ' G1 . G1 . G1 . G1 . G1 G1 G1 G1 G1 G1 G1 G1',
      perc: 'c . s . k . s k k . s . k s s s ' + R('k . s . k . s k k . s . k s s s', 3)
    },
    boss: {
      bpm: 150, loop: true,
      brass: 'E4 - - - B3 - - - E4 - F4 - E4 - D#4 - ' + 'E4 - - - - - - - B3 - C4 - B3 - A3 - ' +
        'G3 - - - C4 - - - E4 - - - G4 - F#4 - ' + 'F#4 - - - D#4 - - - B3 - - - F#4 - - - ' +
        'E5 - G5 - E5 - B4 - E5 - G5 - B5 - - - ' + 'A5 - G5 - F#5 - E5 - D#5 - E5 - F#5 - - - ' +
        'G5 - - - E5 - - - C5 - - - E5 - G5 - ' + 'F#5 - - - - - - - D#5 - - - B4 - - -',
      str: pad(['E3+G3+B3', 'E3+G3+B3', 'C3+E3+G3', 'B2+D#3+F#3', 'E4+G4+B4', 'E4+G4+B4', 'C4+E4+G4', 'B3+D#4+F#4']),
      low: R('E1 E1 E2 E1', 8) + ' ' + R('C2 C2 C3 C2', 4) + ' ' + R('B1 B1 B2 B1', 4) + ' ' + R('E1 E1 E2 E1', 8) + ' ' + R('C2 C2 C3 C2', 4) + ' ' + R('B1 B1 B2 B1', 4),
      timp: R('E2 . . . E2 . . . E2 . . . E2 . B1 .', 8),
      perc: 'c . s k k . s . k . s k k s s s ' + R('k . s k k . s . k . s k k s s s', 3) + ' c . s k k . s . k . s k k s s s ' + R('k . s k k . s . k . s k k s s s', 2) + ' k . s k k . s . r r r r r r r r'
    },
    island: {
      bpm: 112, loop: true,
      brass: 'G4 - B4 - D5 - - - E5 - D5 - B4 - - - ' + 'C5 - - - A4 - - - G4 - - - - - - - ' +
        'G4 - B4 - D5 - - - G5 - F#5 - E5 - - - ' + 'D5 - - - C5 - B4 - A4 - - - - - - -',
      str: pad(['G3+B3+D4', 'C3+E3+G3', 'E3+G3+B3', 'D3+F#3+A3']),
      low: [ost('G1', 'G2'), ost('C2', 'C3'), ost('E1', 'E2'), ost('D1', 'D2')].join(' '),
      timp: R('G1 . . . . . . . D2 . . . . . . .', 4),
      perc: R('k . s . k . s . k . s . k k s .', 4)
    },
    win: {
      bpm: 120, loop: false,
      brass: 'C4 - G4 - C5 - E5 - - - D5 - E5 - - - G5 - - - - - - - - - - - . . . .',
      str: 'C3+E3+G3' + R(' -', 15) + ' G3+C4+E4' + R(' -', 11) + ' . . . .',
      low: 'C2 - - - G1 - - - C2 - - - G1 - - - C2 - - - - - - - - - - - . . . .',
      timp: 'C2 . . . G1 . . . C2 . . . G1 . G1 G1 C2 . . . . . . . . . . . . . . .',
      perc: 'c . . . s . . . k . s . k s s s c . . . . . . . . . . . . . . .'
    },
    over: {
      bpm: 70, loop: false,
      brass: 'A3 - - - G#3 - - - G3 - - - F#3 - - - F3 - - - - - - - - - - - . . . .',
      str: 'A2+C3+E3' + R(' -', 7) + ' F2+A2+C3' + R(' -', 7) + ' D2+F2+A2' + R(' -', 11) + ' . . . .',
      low: 'A1 - - - - - - - F1 - - - - - - - D1 - - - - - - - - - - - . . . .',
      timp: 'A1 . . . . . . . . . . . . . . . D2 . . . . . . . . . . . . . . .',
      perc: 'k . . . . . . . k . . . . . . . r r r r c . . . . . . . . . . .'
    },
    // --- Heisei (V2): düster, langsam, schwer; im Geist der 80er-Filmmusik, aber eigene Melodien ---
    heisei: {   // Titel: grübelnd, a-Moll, Pauken wie fernes Grollen
      bpm: 66, loop: true,
      brass: 'A3 - - - - - - - - - - - Bb3 - - - ' + 'A3 - - - - - - - G3 - - - F3 - - - ' +
        'E3 - - - - - - - F3 - - - G3 - - - ' + 'A3 - - - - - - - - - - - . . . .',
      str: pad(['A2+C3+E3', 'F2+A2+C3', 'E2+G#2+B2', 'A2+C3+E3']),
      low: pad(['A1', 'F1', 'E1', 'A1']),
      timp: 'A1 . . . . . . . . . . . . . . . ' + '. . . . . . . . A1 . . . . . . . ' + 'E1 . . . . . . . E1 . . . E1 . . . ' + 'A1 . . . . . . . . . . . . . . .',
      perc: 'c . . . . . . . . . . . . . . . ' + R('. . . . . . . . . . . . k . . .', 2) + ' r r r r . . . . . . . . . . . .'
    },
    tokyo: {    // Tokio 1984: pulsierendes Ostinato in d, Blech mit kleiner Sekunde (Eb) als Drohung
      bpm: 96, loop: true,
      brass: 'D4 - - - - - - - Eb4 - - - D4 - - - ' + 'C4 - - - - - - - A3 - - - - - - - ' +
        'D4 - - - F4 - - - G4 - - - Ab4 - - - ' + 'G4 - - - - - - - F4 - Eb4 - D4 - - - ' +
        'D5 - - - - - - - Eb5 - - - D5 - - - ' + 'C5 - - - Bb4 - - - A4 - - - - - - - ' +
        'Bb4 - - - A4 - - - G4 - - - F4 - - - ' + 'E4 - - - - - - - A3 - - - - - - - ',
      str: pad(['D3+F3+A3', 'C3+Eb3+G3', 'Bb2+D3+F3', 'A2+C#3+E3', 'D3+F3+A3', 'C3+Eb3+G3', 'G2+Bb2+D3', 'A2+C#3+E3']),
      low: [ost('D2', 'D3'), ost('C2', 'C3'), ost('Bb1', 'Bb2'), ost('A1', 'A2'), ost('D2', 'D3'), ost('C2', 'C3'), ost('G1', 'G2'), ost('A1', 'A2')].join(' '),
      timp: R('D2 . . . . . . . . . . . A1 . . .', 7) + ' A1 . . . A1 . . . A1 . A1 . A1 A1 A1 A1',
      perc: R('k . . . . . . . s . . . . . k .', 7) + ' k . . . s . . . r r r r s . s .'
    },
    superx: {   // Super-X-Marsch: e-Moll, Militärtrommel, Blech in Fanfaren
      bpm: 128, loop: true,
      brass: 'E4 - - B3 E4 - G4 - F#4 - - D4 E4 - - - ' + 'G4 - - E4 G4 - B4 - A4 - G4 - F#4 - - - ' +
        'E5 - - B4 E5 - G5 - F#5 - - D5 E5 - - - ' + 'C5 - B4 - A4 - G4 - F#4 - - - D#4 - - - ',
      str: pad(['E3+G3+B3', 'G3+B3+D4', 'E4+G4+B4', 'C3+E3+A3']),
      low: [ost('E1', 'E2'), ost('G1', 'G2'), ost('E1', 'E2'), ost('B1', 'B2')].join(' '),
      timp: R('E2 . . . B1 . . . E2 . . . B1 . B1 .', 4),
      perc: 'c . s s k . s . k . s s k s s s ' + R('k . s s k . s . k . s s k s s s', 3)
    },
    osaka: {    // Osaka 1989: unruhig, g-Moll, Streicher-Ostinato in Achteln, Blech mit Tritonus (Db) – Biollante-Zeit
      bpm: 104, loop: true,
      brass: 'G3 - - - - - - - Db4 - - - C4 - - - ' + 'Bb3 - - - A3 - - - G3 - - - - - - - ' +
        'G4 - - - F4 - - - Eb4 - - - D4 - - - ' + 'Db4 - - - - - - - C4 - - - D4 - - - ' +
        'G4 - - - Bb4 - - - A4 - - - G4 - - - ' + 'F#4 - - - - - - - D4 - - - - - - - ' +
        'Eb4 - - - D4 - - - C4 - - - Bb3 - - - ' + 'A3 - - - - - - - D4 - - - - - - - ',
      str: pad(['G2+Bb2+D3', 'Eb3+G3+Bb3', 'C3+Eb3+G3', 'Db3+F3+Ab3', 'G2+Bb2+D3', 'D3+F#3+A3', 'C3+Eb3+G3', 'D3+F#3+A3']),
      low: [ost('G1', 'G2'), ost('Eb2', 'Eb3'), ost('C2', 'C3'), ost('Db2', 'Db3'), ost('G1', 'G2'), ost('D2', 'D3'), ost('C2', 'C3'), ost('D2', 'D3')].join(' '),
      timp: R('G1 . . . . . . . G1 . . . . . . .', 6) + ' D2 . . . . . . . D2 . . . D2 . . . ' + 'D2 . D2 . D2 . D2 . D2 D2 D2 D2 D2 . . .',
      perc: R('k . . s . . k . . . s . k . . .', 7) + ' k . s . k . s . r r r r s s s s'
    },
    superx2: {  // Super-X2: kühler, mechanischer Marsch in c-Moll, Synkopen, Fanfare mit erhöhter Quarte
      bpm: 136, loop: true,
      brass: 'C4 - - G3 C4 - Eb4 - F#4 - G4 - - - - - ' + 'Ab4 - G4 - F4 - Eb4 - D4 - - - G3 - - - ' +
        'C5 - - G4 C5 - Eb5 - F#5 - G5 - - - - - ' + 'Ab5 - G5 - F5 - Eb5 - D5 - C5 - B4 - - - ',
      str: pad(['C3+Eb3+G3', 'Ab2+C3+Eb3', 'C3+Eb3+G3', 'G2+B2+D3']),
      low: [ost('C2', 'C3'), ost('Ab1', 'Ab2'), ost('C2', 'C3'), ost('G1', 'G2')].join(' '),
      timp: R('C2 . . C2 . . G1 . C2 . . . G1 . G1 .', 4),
      perc: R('k . s . . s k . k . s . k s . s', 3) + ' k . s . k . s . r r r r s s s s'
    },
    biollante: { // Biollante: langsam, klagend, fis-Moll, Streicherflächen mit Ganztonschritten, wie ein Chor
      bpm: 72, loop: true,
      brass: 'F#3 - - - - - - - G#3 - - - A3 - - - ' + 'C4 - - - - - - - B3 - - - A3 - - - ' +
        'F#4 - - - - - - - E4 - - - D4 - - - ' + 'C4 - - - - - - - - - - - . . . . ',
      str: pad(['F#2+A2+C#3', 'D2+F#2+A2', 'C2+E2+G#2', 'C#2+F2+G#2']),
      low: pad(['F#1', 'D1', 'C1', 'C#1']),
      timp: 'F#1 . . . . . . . . . . . . . . . ' + '. . . . . . . . D2 . . . . . . . ' + 'C2 . . . . . . . C2 . . . . . . . ' + 'C#2 . . . C#2 . . . C#2 . C#2 . C#2 C#2 C#2 C#2',
      perc: 'c . . . . . . . . . . . . . . . ' + R('. . . . . . . . k . . . . . . .', 2) + ' r r r r . . . . k . . . k . . .'
    },
    sapporo: {  // Sapporo 1991: kalt und weit, e-Moll, Hörner in Quarten, Streicher-Tremolo, schwerer Schritt
      bpm: 92, loop: true,
      brass: 'E3 - - - B3 - - - A3 - - - G3 - - - ' + 'F#3 - - - - - - - E3 - - - - - - - ' +
        'E4 - - - D4 - - - B3 - - - C4 - - - ' + 'B3 - - - - - - - - - - - F#3 - - - ',
      str: pad(['E2+G2+B2', 'C2+E2+G2', 'E2+G2+B2', 'B1+D#2+F#2']),
      low: [ost('E1', 'E2'), ost('C1', 'C2'), ost('E1', 'E2'), ost('B0', 'B1')].join(' '),
      timp: R('E1 . . . . . . . E1 . . . . . . .', 3) + ' B1 . . . B1 . . . B1 . B1 . B1 B1 B1 B1',
      perc: R('k . . . s . . . k . k . s . . .', 3) + ' k . s . k . s . r r r r s s s s'
    },
    ghidorah: { // King Ghidorah: schrill und drängend, Blech in Tritonus-Sprüngen über einem Ostinato in d
      bpm: 132, loop: true,
      brass: 'D4 - G#4 - D5 - - - C5 - G#4 - F4 - - - ' + 'E4 - Bb4 - E5 - - - D5 - A4 - F4 - - - ' +
        'D5 - - - C#5 - - - C5 - - - B4 - - - ' + 'Bb4 - A4 - G#4 - G4 - F#4 - F4 - E4 - - - ',
      str: pad(['D3+F3+G#3', 'E3+G3+Bb3', 'D3+F3+A3', 'Bb2+D3+F3']),
      low: [ost('D2', 'D3'), ost('E2', 'E3'), ost('D2', 'D3'), ost('Bb1', 'Bb2')].join(' '),
      timp: R('D2 . . D2 . . G#1 . D2 . . . G#1 . G#1 .', 4),
      perc: R('k . s s k . s . k s s . k s s s', 3) + ' k k s s k k s s r r r r s s s s'
    },
    mecha: {    // Mecha-King Ghidorah: mechanischer Marsch, gleichmäßige Achtel, Blech in parallelen Quinten
      bpm: 120, loop: true,
      brass: 'A3+E4 - - - A3+E4 - C4+G4 - B3+F#4 - - - G3+D4 - - - ' + 'A3+E4 - - - C4+G4 - D4+A4 - E4+B4 - - - - - - - ' +
        'F4+C5 - - - E4+B4 - - - D4+A4 - - - C4+G4 - - - ' + 'B3+F#4 - - - - - - - E3+B3 - - - - - - - ',
      str: pad(['A2+C3+E3', 'C3+E3+G3', 'F2+A2+C3', 'E2+G#2+B2']),
      low: [ost('A1', 'A2'), ost('C2', 'C3'), ost('F1', 'F2'), ost('E1', 'E2')].join(' '),
      timp: R('A1 . A1 . . . A1 . A1 . A1 . . . E1 .', 4),
      perc: R('k . s . k . s . k . s . k s s .', 3) + ' k s k s k s k s r r r r s s s s'
    },
    yokohama: { // Yokohama 1992: Hafenstadt bei Nacht, h-Moll, wiegender Puls, Hörner und tiefe Streicher
      bpm: 84, loop: true,
      brass: 'B3 - - - - - D4 - C#4 - - - B3 - - - ' + 'F#3 - - - - - - - - - - - . . . . ' +
        'G3 - - - - - B3 - A3 - - - F#3 - - - ' + 'E3 - - - - - - - F#3 - - - - - - - ' +
        'B3 - - - - - D4 - E4 - - - F#4 - - - ' + 'G4 - - - F#4 - - - E4 - - - - - - - ' +
        'D4 - - - - - C#4 - B3 - - - A#3 - - - ' + 'B3 - - - - - - - - - - - . . . . ',
      str: pad(['B2+D3+F#3', 'B2+D3+F#3', 'G2+B2+D3', 'F#2+A#2+C#3', 'B2+D3+F#3', 'E2+G2+B2', 'G2+B2+D3', 'F#2+A#2+C#3']),
      low: pad(['B1', 'B1', 'G1', 'F#1', 'B1', 'E1', 'G1', 'F#1']),
      timp: R('B1 . . . . . . . F#1 . . . . . . .', 7) + ' F#1 . . . F#1 . . . F#1 . F#1 . F#1 F#1 F#1 F#1',
      perc: R('k . . . s . . k . . s . . . . .', 7) + ' k . . . s . . . r r r r s . s .'
    },
    battra: {   // Battra: wild und schwarz, c-Moll, rasende Achtel, Blech in kleinen Sekunden
      bpm: 144, loop: true,
      brass: 'C4 Db4 C4 - G3 - C4 - Eb4 - D4 Db4 C4 - - - ' + 'Ab3 - G3 - F#3 - G3 - C4 - - - Bb3 - - - ' +
        'C5 Db5 C5 - G4 - C5 - Eb5 - D5 Db5 C5 - - - ' + 'Ab4 - G4 - F4 - Eb4 - D4 - - - G3 - - - ',
      str: pad(['C3+Eb3+G3', 'Ab2+C3+Eb3', 'C3+Eb3+G3', 'G2+B2+D3']),
      low: [ost('C2', 'C3'), ost('Ab1', 'Ab2'), ost('C2', 'C3'), ost('G1', 'G2')].join(' '),
      timp: R('C2 . C2 . G1 . C2 . C2 . G1 . C2 C2 G1 .', 4),
      perc: R('k s k s k s s . k s k s k s s s', 3) + ' k k s s k k s s r r r r s s s s'
    },
    mothra: {   // Mothra: hell und feierlich, F-Dur, getragene Melodie über wiegenden Streichern (eigene Melodie)
      bpm: 76, loop: true,
      brass: 'F4 - - - A4 - - - C5 - - - - - - - ' + 'Bb4 - - - A4 - - - G4 - - - - - - - ' +
        'A4 - - - C5 - - - D5 - - - C5 - - - ' + 'Bb4 - - - A4 - - - G4 - - - F4 - - - ',
      str: pad(['F3+A3+C4', 'G3+Bb3+D4', 'F3+A3+C4', 'C3+E3+G3']),
      low: pad(['F1', 'G1', 'F1', 'C2']),
      timp: 'F1 . . . . . . . . . . . . . . . ' + '. . . . . . . . . . . . . . . . ' + 'F1 . . . . . . . . . . . . . . . ' + 'C2 . . . . . . . C2 . . . C2 . . . ',
      perc: 'c . . . . . . . . . . . . . . . ' + R('. . . . . . . . . . . . . . . .', 2) + ' r r r r . . . . . . . . . . . .'
    },
    makuhari: { // Makuhari 1993: nüchtern und modern, d-Dorisch, treibende Achtel, kühle Bläser
      bpm: 108, loop: true,
      brass: 'D4 - - - F4 - G4 - A4 - - - - - - - ' + 'C5 - B4 - A4 - G4 - E4 - - - - - - - ' +
        'D4 - - - F4 - G4 - A4 - C5 - D5 - - - ' + 'C5 - - - A4 - - - G4 - - - E4 - - - ',
      str: pad(['D3+F3+A3', 'C3+E3+G3', 'D3+F3+A3', 'A2+C3+E3']),
      low: [ost('D2', 'D3'), ost('C2', 'C3'), ost('D2', 'D3'), ost('A1', 'A2')].join(' '),
      timp: R('D2 . . . . . . . A1 . . . . . . .', 4),
      perc: R('k . s . k k s . k . s . k k s s', 4)
    },
    rodan: {    // Rodan: kreischend und wild, e-Moll, schnelle Blechstöße
      bpm: 150, loop: true,
      brass: 'E5 - D5 - B4 - - - E5 - G5 - F#5 - - - ' + 'E5 - D5 - B4 - A4 - G4 - - - F#4 - - - ' +
        'E4 - G4 - B4 - E5 - D5 - C5 - B4 - - - ' + 'A4 - G4 - F#4 - D#4 - E4 - - - - - - - ',
      str: pad(['E3+G3+B3', 'C3+E3+G3', 'A2+C3+E3', 'B2+D#3+F#3']),
      low: [ost('E2', 'E3'), ost('C2', 'C3'), ost('A1', 'A2'), ost('B1', 'B2')].join(' '),
      timp: R('E2 . E2 . B1 . . . E2 . E2 . B1 . B1 .', 4),
      perc: R('k s k s k . s s k s k s k s s s', 4)
    },
    gforce: {   // G-Force-Marsch (eigene Melodie): heroisch, B-Dur, Militärtrommel
      bpm: 126, loop: true,
      brass: 'Bb3 - - Bb3 D4 - F4 - Bb4 - - - A4 - G4 - ' + 'F4 - - Eb4 D4 - C4 - D4 - - - - - - - ' +
        'Bb3 - - Bb3 D4 - F4 - Bb4 - - - C5 - D5 - ' + 'Eb5 - D5 - C5 - A4 - Bb4 - - - - - - - ',
      str: pad(['Bb2+D3+F3', 'Eb3+G3+Bb3', 'Bb2+D3+F3', 'F2+A2+C3']),
      low: [ost('Bb1', 'Bb2'), ost('Eb2', 'Eb3'), ost('Bb1', 'Bb2'), ost('F1', 'F2')].join(' '),
      timp: R('Bb1 . . . F1 . . . Bb1 . . . F1 . F1 .', 4),
      perc: 'c . s s k . s . k . s s k s s s ' + R('k . s s k . s . k . s s k s s s', 3)
    },
    ariake: {   // Tokio 1995: drohend, e-Moll, Herzschlag in den Pauken (Godzillas Herz vor der Kernschmelze)
      bpm: 84, loop: true,
      brass: 'E3 - - - - - - - G3 - - - F#3 - - - ' + 'E3 - - - B2 - - - C3 - - - B2 - - - ' +
        'E4 - - - D4 - - - C4 - - - B3 - - - ' + 'A3 - - - C4 - - - B3 - - - - - - - ',
      str: pad(['E2+G2+B2', 'C2+E2+G2', 'A2+C3+E3', 'B2+D#3+F#3']),
      low: pad(['E1', 'C1', 'A1', 'B1']),
      timp: R('E1 . E1 . . . . . E1 . E1 . . . . .', 4),
      perc: R('k . k . . . . . k . k . . . s .', 4)
    },
    destoroyah: {  // Destoroyah: grell und dissonant, Tritonus-Fanfaren, gehetzte Streicher
      bpm: 126, loop: true,
      brass: 'D4 - G#4 - D4 - - - C#4 - G4 - C#4 - - - ' + 'D4 - G#4 - A4 - G#4 - D4 - - - - - - - ' +
        'F4 - B4 - F4 - - - E4 - Bb4 - E4 - - - ' + 'D5 - C#5 - C5 - B4 - Bb4 - - - A4 - - - ',
      str: pad(['D3+F3+G#3', 'C#3+E3+G3', 'D3+F3+A3', 'D3+F3+G#3']),
      low: [ost('D1', 'G#1'), ost('C#1', 'G1'), ost('D1', 'A1'), ost('D1', 'G#1')].join(' '),
      timp: R('D1 . . D1 . . G#1 . D1 . . D1 . . G#1 .', 4),
      perc: R('k . s k . k s . k . s k k . s s', 4)
    },
    burning: {  // Endkampf: Burning Godzilla – breit und tragisch, d-Moll, das Hauptmotiv in Moll gewendet
      bpm: 96, loop: true,
      brass: 'D4 - - - A3 - D4 - F4 - - - E4 - D4 - ' + 'C4 - - - A3 - - - Bb3 - - - A3 - - - ' +
        'D4 - - - A3 - D4 - F4 - - - G4 - A4 - ' + 'Bb4 - - - A4 - G4 - A4 - - - - - - - ',
      str: pad(['D3+F3+A3', 'A2+C#3+E3', 'D3+F3+A3', 'Bb2+D3+F3']),
      low: [ost('D1', 'D2'), ost('A1', 'A2'), ost('D1', 'D2'), ost('Bb1', 'Bb2')].join(' '),
      timp: R('D1 . . . A1 . . . D1 . . . A1 . A1 .', 4),
      perc: 'c . . . s . . . k . s . k s s s ' + R('k . . . s . . . k . s . k . s .', 3)
    },
    requiem: {  // Godzillas Tod: langsames Klagelied, a-Moll, verklingt
      bpm: 54, loop: false,
      brass: 'A3 - - - - - - - C4 - - - B3 - - - ' + 'A3 - - - - - - - E3 - - - - - - - ' +
        'F3 - - - - - - - E3 - - - D3 - - - ' + 'E3 - - - - - - - - - - - - - - - ' + 'A2 - - - - - - - - - - - - - - - . . . .',
      str: pad(['A2+C3+E3', 'A2+C3+E3', 'F2+A2+C3', 'E2+G#2+B2', 'A2+C3+E3']) + ' . . . .',
      low: pad(['A1', 'A1', 'F1', 'E1', 'A1']) + ' . . . .',
      timp: 'A1 . . . . . . . . . . . . . . . ' + '. . . . . . . . . . . . . . . . ' + 'F1 . . . . . . . . . . . . . . . ' + 'E1 . . . E1 . . . E1 . . . E1 . . . ' + 'A1 . . . . . . . . . . . . . . . . . . .',
      perc: R('. . . . . . . . . . . . . . . .', 4) + ' c . . . . . . . . . . . . . . . . . . .'
    },
    fukuoka: {  // Fukuoka 1994: unruhig-mystisch, cis-Moll, Synth-Streicher in Quartschichtungen
      bpm: 98, loop: true,
      brass: 'C#4 - - - G#4 - - - F#4 - E4 - D#4 - - - ' + 'E4 - - - B3 - - - C#4 - - - - - - - ' +
        'C#5 - - - B4 - A4 - G#4 - - - E4 - - - ' + 'F#4 - - - D#4 - - - C#4 - - - - - - - ',
      str: pad(['C#3+E3+G#3', 'A2+C#3+E3', 'F#2+A2+C#3', 'G#2+B#2+D#3']),
      low: [ost('C#2', 'C#3'), ost('A1', 'A2'), ost('F#1', 'F#2'), ost('G#1', 'G#2')].join(' '),
      timp: R('C#2 . . . . . G#1 . C#2 . . . . . . .', 4),
      perc: R('k . . s . . k . k . s . . . k .', 4)
    },
    moguera: {  // Moguera-Marsch (eigene Melodie): F-Dur, zackig, Trompetenfanfare
      bpm: 132, loop: true,
      brass: 'F4 - - C4 F4 - A4 - C5 - - - A4 - F4 - ' + 'G4 - - E4 C4 - E4 - G4 - - - - - - - ' +
        'F4 - - C4 F4 - A4 - C5 - - - D5 - C5 - ' + 'Bb4 - A4 - G4 - E4 - F4 - - - - - - - ',
      str: pad(['F3+A3+C4', 'C3+E3+G3', 'F3+A3+C4', 'Bb2+D3+F3']),
      low: [ost('F1', 'F2'), ost('C2', 'C3'), ost('F1', 'F2'), ost('Bb1', 'Bb2')].join(' '),
      timp: R('F1 . . . C2 . . . F1 . . . C2 . C2 .', 4),
      perc: 'c . s s k . s . k . s s k s s s ' + R('k . s s k . s . k . s s k s s s', 3)
    },
    spaceg: {   // SpaceGodzilla: kalt und erhaben, b-Moll, Synth-Chor, langsame Glockentöne
      bpm: 80, loop: true,
      brass: 'Bb3 - - - - - - - F4 - - - Gb4 - - - ' + 'F4 - - - Db4 - - - C4 - - - - - - - ' +
        'Bb4 - - - - - - - A4 - - - Gb4 - - - ' + 'F4 - - - - - - - - - - - . . . . ',
      str: pad(['Bb2+Db3+F3', 'Gb2+Bb2+Db3', 'Bb2+Db3+F3', 'F2+A2+C3']),
      low: pad(['Bb1', 'Gb1', 'Bb1', 'F1']),
      timp: 'Bb1 . . . . . . . . . . . . . . . ' + '. . . . . . . . Gb1 . . . . . . . ' + 'Bb1 . . . . . . . Bb1 . . . . . . . ' + 'F1 . . . F1 . . . F1 . F1 . F1 F1 F1 F1',
      perc: 'c . . . . . . . . . . . . . . . ' + R('. . . . . . . . k . . . . . . .', 2) + ' r r r r . . . . k . . . k . . .'
    },
    dance: {
      bpm: 170, loop: false,
      brass: 'C5 C5 . C5 . A4 C5 . D5 . C5 . A4 . G4 . C5 C5 . C5 . A4 C5 . F5 - - - E5 - - -',
      str: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .',
      low: 'F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 . F2 . C3 . F2 . C3 . C3 - - - C2 - - -',
      timp: '. . . . . . . . . . . . . . . . . . . . . . . . C2 . . . C2 . . .',
      perc: 'k . s . k . s . k . s . k s s s k . s . k . s . k . s . k s s s'
    }
  };
  var CH = ['brass', 'str', 'low', 'timp', 'perc'];

  function compile(s) {
    var ev = {}, len = 0;
    CH.forEach(function (ch) {
      var toks = (s[ch] || '.').trim().split(/\s+/), list = [];
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (t === '.' || t === '-') continue;
        if (ch === 'perc') { list[i] = { d: t }; continue; }
        var n = 1; while (toks[i + n] === '-') n++;
        list[i] = { f: t.split('+').map(freq), n: n };
      }
      ev[ch] = { list: list, len: toks.length };
      len = Math.max(len, toks.length);
    });
    return { ev: ev, len: len };
  }

  function tick() {
    if (!ctx || !song) return;
    var sd = 60 / song.bpm / 4;
    while (nextTime < ctx.currentTime + 0.2) {
      if (!song.loop && step >= songEvents.len) { song = null; return; }
      var chans = songEvents.ev;
      for (var ch in chans) {
        var c = chans[ch], e = c.list[step % c.len];
        if (!e) continue;
        var dur = e.n * sd;
        if (ch === 'perc') perc(e.d, nextTime);
        else if (ch === 'brass') brass(e.f[0], nextTime, dur * 0.95, 0.15);
        else if (ch === 'str') strings(e.f, nextTime, dur, 0.035);
        else if (ch === 'low') low(e.f[0], nextTime, Math.min(dur, 0.5), 0.3);
        else if (ch === 'timp') timp(e.f[0], nextTime, 0.55);
      }
      step++;
      nextTime += sd;
    }
  }

  function play(name) {
    if (!ctx) return;
    if (songName === name && song) return;
    songName = name;
    song = SONGS[name]; songEvents = compile(song); step = 0; nextTime = ctx.currentTime + 0.08;
    if (!timer) timer = setInterval(tick, 40);
  }
  function stopMusic() { song = null; songName = ''; }

  /* ---------- Effekte ---------- */
  function noise(t, dur, type, f0, f1, vol, q, wet) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (q) f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfx);
    if (wet) { var w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
    s.start(t); s.stop(t + dur + 0.02);
  }
  function sweep(type, t, dur, f0, f1, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfx); o.start(t); o.stop(t + dur + 0.02);
  }
  var curveCache = null;
  function distCurve() {
    if (curveCache) return curveCache;
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 3.2); }
    return (curveCache = c);
  }

  /* Kaiju-Schreie: Sample für Sample berechnet (keine Gleitton-Oszillatoren -> keine "Sirene").
     Anregung = unregelmäßiger Impulszug wie eine mit Leder gestrichene Kontrabass-Saite (Stick-Slip):
     zufällig schwankende Periode, gelegentliche Unterharmonische (Knurren), Rauhigkeit, Atemrauschen.
     Danach Formantfilter (Rachen), Sättigung und Hüllkurve. Typen: godzilla, mecha, rodan, ghidorah, deep. */
  var ROARS = {
    // wie 1954: Kontrabass-Saite, mit harzigem Lederhandschuh gestrichen, verlangsamt abgespielt
    godzilla: { bow: true, slow: 2, len: 1.9, pts: [[0, 200], [0.08, 340], [0.38, 370], [0.72, 350], [0.86, 310], [0.95, 230], [1.06, 290], [1.4, 250], [1.9, 130]],
      press: [0.995, 0.97], split: 0.92, rasp: 1.0, gap: [0.88, 0.98], dry: 0.7, drive: 2.8, scratch: 0.16, scratchP: 0.08, pj: 1, hiss: 0.25,
      form: [[1000, 4, 1], [2300, 5, 0.8], [4600, 6, 0.5], [6800, 7, 0.25]] },
    mecha: { len: 2.1, pts: [[0, 180], [0.2, 330], [1.2, 300], [2.1, 160]],
      jit: 0.05, sub: 0.15, breath: 0.08, form: [[900, 12, 1], [1900, 14, 0.8], [3300, 14, 0.5]], drive: 3.2, grit: 0.25, ring: 155 },
    rodan: { len: 1.5, pts: [[0, 420], [0.1, 760], [0.6, 700], [1.5, 420]],
      jit: 0.12, sub: 0.1, breath: 0.3, form: [[1400, 6, 1], [2700, 7, 0.7], [4200, 8, 0.4]], drive: 2.2, grit: 0.35 },
    ghidorah: { len: 1.9, pts: [[0, 520], [0.12, 880], [1.3, 780], [1.9, 560]],
      jit: 0.08, sub: 0.05, breath: 0.15, form: [[1200, 8, 1], [2400, 9, 0.7], [3800, 9, 0.4]], drive: 2.4, grit: 0.2, gate: 13 },
    deep: { len: 2.4, pts: [[0, 60], [0.3, 105], [1.5, 92], [2.4, 48]],
      jit: 0.22, sub: 0.55, breath: 0.35, form: [[280, 5, 1], [640, 6, 0.8], [1300, 6, 0.45]], drive: 3, grit: 0.5 }
  };
  var roarBufs = {};
  function contour(pts, t) {
    for (var i = 1; i < pts.length; i++) if (t <= pts[i][0]) {
      var a = pts[i - 1], b = pts[i], k = (t - a[0]) / (b[0] - a[0] || 1);
      k = k * k * (3 - 2 * k);
      return a[1] + (b[1] - a[1]) * k;
    }
    return pts[pts.length - 1][1];
  }
  /* Physikalisches Modell einer gestrichenen Saite (nach McIntyre/Woodhouse bzw. STK "Bowed"):
     zwei Verzögerungsleitungen (Bogen -> Steg, Bogen -> Sattel) und eine Reibungskurve am Bogen,
     die das Haften und Gleiten des Handschuhs erzeugt. Hoher Druck = kratzig-schrill. */
  function makeBowed(C) {
    var sr = ctx.sampleRate, slow = C.slow, n = Math.floor(sr * C.len / slow);
    var buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
    var seed = 4711; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var SZ = 8192;
    function DL() { return { b: new Float32Array(SZ), w: 0 }; }
    function tick(d, x, len) {
      var rp = d.w - len; while (rp < 0) rp += SZ;
      var i0 = Math.floor(rp), fr = rp - i0, y = d.b[i0] * (1 - fr) + d.b[(i0 + 1) % SZ] * fr;
      d.b[d.w] = x; d.w = (d.w + 1) % SZ; return y;
    }
    var neck = DL(), bridge = DL(), lastN = 0, lastB = 0, lp = 0, beta = 0.127, jit = 0, peak = 1e-4, pjit = 0;
    var F = C.form.map(function (f) {
      var w = 2 * Math.PI * f[0] / sr, al = Math.sin(w) / (2 * f[1]), a0 = 1 + al;
      return { g: f[2], b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
    });
    for (var i = 0; i < n; i++) {
      var t = i / sr * slow, f0 = contour(C.pts, t) * slow, period = sr / f0;
      var env = Math.min(1, t / 0.08) * Math.min(1, (C.len - t) / (C.len * 0.3));
      if (C.gap && t > C.gap[0] && t < C.gap[1]) env *= 0.4;
      jit += (rnd() - 0.5) * 0.3; jit *= 0.995;
      var press = t < C.split ? C.press[0] : C.press[1];
      // lockere Saite: Länge schwankt unruhig -> rau statt glatt
      pjit += (rnd() - 0.5) * 0.02; pjit *= 0.985;
      if (C.pj) period *= 1 + pjit * C.pj;
      var bowV = (0.17 + 0.05 * jit + (C.scratch ? (rnd() < (C.scratchP || 0.02) ? -C.scratch : 0) : 0)) * env * (1 + (rnd() - 0.5) * C.rasp);
      lp = lp * 0.3 + lastB * 0.7;
      var bridgeRefl = -lp * 0.97, nutRefl = -lastN, dv = bowV - (bridgeRefl + nutRefl);
      var x = dv * (5 - 4 * press) + 0.001, bt = Math.pow(Math.abs(x) + 0.75, -4); if (bt > 1) bt = 1;
      var nv = dv * bt;
      lastN = tick(neck, bridgeRefl + nv, Math.max(2, period * (1 - beta) - 1));
      lastB = tick(bridge, nutRefl + nv, Math.max(2, period * beta));
      var ex = lastB + (C.hiss ? (rnd() * 2 - 1) * C.hiss * env * 0.3 : 0), y = ex * C.dry;
      for (var k = 0; k < F.length; k++) {
        var fl = F[k], yo = fl.b0 * ex + fl.b2 * fl.x2 - fl.a1 * fl.y1 - fl.a2 * fl.y2;
        fl.x2 = fl.x1; fl.x1 = ex; fl.y2 = fl.y1; fl.y1 = yo; y += yo * fl.g;
      }
      y = Math.tanh(y * C.drive * 4) * (0.25 + 0.75 * env);
      out[i] = y; if (Math.abs(y) > peak) peak = Math.abs(y);
    }
    for (i = 0; i < n; i++) out[i] *= 0.9 / peak;
    buf.slow = slow;
    return buf;
  }
  function makeRoar(kind) {
    if (roarBufs[kind]) return roarBufs[kind];
    if (ROARS[kind].bow) return (roarBufs[kind] = makeBowed(ROARS[kind]));
    var C = ROARS[kind], sr = ctx.sampleRate, n = Math.floor(sr * C.len);
    var buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
    var seed = 12345 + kind.length * 777;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    // Formant-Biquads (RBJ-Bandpass), Zustände pro Filter
    var F = C.form.map(function (f) { return { f: f[0], q: f[1], g: f[2], x1: 0, x2: 0, y1: 0, y2: 0, b0: 0, b2: 0, a1: 0, a2: 0 }; });
    function coef(fl, scale) {
      var w = 2 * Math.PI * fl.f * scale / sr, al = Math.sin(w) / (2 * fl.q), a0 = 1 + al;
      fl.b0 = al / a0; fl.b2 = -al / a0; fl.a1 = -2 * Math.cos(w) / a0; fl.a2 = (1 - al) / a0;
    }
    var next = 0, pulseAmp = 0, flip = 0, lp = 0, rough = 0, peak = 0.0001, f0 = C.pts[0][1];
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      if ((i & 63) === 0) {
        f0 = contour(C.pts, t);
        var sc = 0.85 + 0.3 * (f0 - C.pts[0][1]) / (C.pts[1][1] - C.pts[0][1] + 1); // Rachen öffnet sich mit der Tonhöhe
        sc = Math.max(0.8, Math.min(1.25, sc));
        F.forEach(function (fl) { coef(fl, sc); });
        rough += (rnd() - 0.5) * 0.4; rough *= 0.9;
      }
      // Stick-Slip-Impulse mit zufälliger Periode
      var ex = 0;
      if (i >= next) {
        flip = 1 - flip;
        var per = sr / (f0 * (1 + rough * 0.15)) * (1 + (rnd() - 0.5) * C.jit);
        if (rnd() < C.sub && flip) per *= 2; // Unterharmonische -> Knurren
        next = i + Math.max(8, per);
        pulseAmp = 0.7 + rnd() * 0.6;
        ex = pulseAmp;
      }
      // Reibung zwischen den Impulsen + Atem
      var nz = rnd() * 2 - 1;
      lp += (nz - lp) * 0.25;
      ex += lp * C.grit * (0.4 + pulseAmp * 0.6) + nz * C.breath * 0.35;
      pulseAmp *= 0.9993;
      // Formanten
      var y = 0;
      for (var k = 0; k < F.length; k++) {
        var fl = F[k], yo = fl.b0 * ex + fl.b2 * fl.x2 - fl.a1 * fl.y1 - fl.a2 * fl.y2;
        fl.x2 = fl.x1; fl.x1 = ex; fl.y2 = fl.y1; fl.y1 = yo;
        y += yo * fl.g;
      }
      if (C.ring) y *= 0.55 + 0.45 * Math.sin(2 * Math.PI * C.ring * t);
      if (C.gate) y *= 0.35 + 0.65 * (Math.sin(2 * Math.PI * C.gate * t) > -0.2 ? 1 : 0);
      // Hüllkurve: Einsatz, zweiteiliger Schrei, Ausklang
      var env = Math.min(1, t / 0.12) * Math.min(1, (C.len - t) / (C.len * 0.35));
      if (C.gap && t > C.gap[0] && t < C.gap[1]) env *= 0.45 + 0.55 * Math.abs((t - (C.gap[0] + C.gap[1]) / 2) / ((C.gap[1] - C.gap[0]) / 2));
      env *= 0.85 + 0.15 * Math.sin(t * 2 * Math.PI * 6.3 + rough * 3);
      y = Math.tanh(y * C.drive * 6) * env;
      out[i] = y;
      if (Math.abs(y) > peak) peak = Math.abs(y);
    }
    for (i = 0; i < n; i++) out[i] *= 0.9 / peak;
    roarBufs[kind] = buf;
    return buf;
  }
  // Eigene Schrei-Aufnahmen aus music/ (bleiben lokal wie die Musik): roar1… für Godzilla, kg1… für King Ghidorah,
  // mkg1… für Mecha-King Ghidorah, bio1… für Biollante. Feste Reihenfolge nach Dateinummer.
  // Fehlen sie, schreit der Synthesizer. Die 404-Meldungen beim Suchen sind gewollt.
  var VOICES = { godzilla: ['roar1', 'roar2', 'roar3'], kg: ['kg1', 'kg2', 'kg3', 'kg4', 'kg5', 'kg6'], mkg: ['mkg1', 'mkg2', 'mkg3', 'mkg4'],
    bio: ['bio1', 'bio2', 'bio3', 'bio4', 'bio5', 'bio6'], batt: ['batt1', 'batt2', 'batt3', 'batt4'],
    moth: ['moth1', 'moth2', 'moth3', 'moth4'], rodan: ['rodan1', 'rodan2', 'rodan3', 'rodan4'], mg: ['mg1', 'mg2', 'mg3'],
    moguera: ['mog1', 'mog2', 'mog3'], sg: ['sg1', 'sg2', 'sg3', 'sg4'], des: ['des1', 'des2', 'des3', 'des4', 'des5'] };
  var roarFiles = {}, roarNext = {};
  Object.keys(VOICES).forEach(function (v) { roarFiles[v] = []; roarNext[v] = 0; });
  function loadRoarFiles() {
    Object.keys(VOICES).forEach(function (v) { VOICES[v].forEach(function (n, i) { loadVoice(v, n, i); }); });
  }
  function loadVoice(v, n, i) {                               // erste passende Endung gewinnt
    ['ogg', 'mp3', 'm4a', 'wav'].reduce(function (p, ext) {
      return p.then(function (done) {
        if (done) return true;
        return fetch('music/' + n + '.' + ext).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
          .then(function (ab) { return ab ? ctx.decodeAudioData(ab).then(function (b) { roarFiles[v][i] = b; return true; }) : false; })
          .catch(function () { return false; });
      });
    }, Promise.resolve(false));
  }

  // voice: welche eigenen Aufnahmen ('godzilla' = Standard für kind 'godzilla', 'kg' für King Ghidorah)
  function roar(kind, pitch, voice) {
    kind = ROARS[kind] ? kind : 'godzilla';
    voice = voice || (kind === 'godzilla' ? 'godzilla' : null);
    var list = voice && roarFiles[voice] && roarFiles[voice].filter(Boolean);
    if (list && list.length) {                              // eigene Aufnahme, der Reihe nach
      var t0 = ctx.currentTime, s0 = ctx.createBufferSource(), g0 = ctx.createGain();
      s0.buffer = list[roarNext[voice]++ % list.length];
      s0.playbackRate.value = pitch || 1;
      g0.gain.value = 0.55;
      s0.connect(g0); g0.connect(sfx);
      var w0 = ctx.createGain(); w0.gain.value = 0.18; g0.connect(w0); w0.connect(verb);
      s0.start(t0);
      return;
    }
    var t = ctx.currentTime, src = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    src.buffer = makeRoar(kind);
    src.playbackRate.value = (pitch || 1) / (src.buffer.slow || 1);
    hp.type = 'highpass'; hp.frequency.value = 50;
    g.gain.value = 0.28;
    src.connect(hp); hp.connect(g); g.connect(sfx);
    var w = ctx.createGain(); w.gain.value = 0.22; g.connect(w); w.connect(verb);
    src.start(t);
    if (kind === 'godzilla' || kind === 'deep') sweep('sine', t, 0.6, 70, 35, 0.15); // Bauchresonanz
  }

  var fx = {
    roar: function (a) { roar(a && a.kind, a && a.pitch, a && a.voice); },
    boom: function (big) {
      var t = ctx.currentTime;
      noise(t, big ? 1.1 : 0.5, 'lowpass', big ? 1800 : 2600, 60, big ? 0.9 : 0.5, 0, 0.4);
      sweep('sine', t, big ? 0.6 : 0.3, 110, 30, big ? 0.9 : 0.5);
    },
    hit: function () { var t = ctx.currentTime; sweep('sine', t, 0.18, 160, 45, 0.8); noise(t, 0.14, 'bandpass', 1400, 500, 0.5, 1.5); },
    // tiefes Einatmen + ansteigendes Atom-Summen
    charge: function (dur) {
      var t = ctx.currentTime, d = dur || 0.6;
      noise(t, d * 0.9, 'bandpass', 350, 1800, 0.4, 1.5, 0.3);
      var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'square';
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(420, t + d);
      o2.frequency.setValueAtTime(140, t); o2.frequency.exponentialRampToValueAtTime(840, t + d);
      f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + d);
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.18, t + d * 0.95); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.1);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(sfx);
      var w = ctx.createGain(); w.gain.value = 0.22; g.connect(w); w.connect(verb);
      o.start(t); o2.start(t); o.stop(t + d + 0.15); o2.stop(t + d + 0.15);
    },
    // Luftschutzsirene (auf- und abschwellend, leise im Hintergrund)
    siren: function () {
      var t = ctx.currentTime, g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 1.5); g.gain.setValueAtTime(0.07, t + 5.5); g.gain.linearRampToValueAtTime(0.0001, t + 8);
      [0, 6].forEach(function (det) {
        var o = ctx.createOscillator(); o.type = 'square'; o.detune.value = det * 10;
        o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(560, t + 2.5); o.frequency.setValueAtTime(560, t + 4);
        o.frequency.linearRampToValueAtTime(260, t + 8);
        o.connect(f); o.start(t); o.stop(t + 8.1);
      });
      f.connect(g); g.connect(sfx);
      var w = ctx.createGain(); w.gain.value = 0.6; g.connect(w); w.connect(verb);
    },
    // Lautsprecher-Gong vor einer Durchsage
    radio: function () {
      var t = ctx.currentTime;
      [[784, 0], [622, 0.35]].forEach(function (n) { sweep('triangle', t + n[1], 0.5, n[0], n[0], 0.12); });
      noise(t, 0.8, 'bandpass', 2500, 1800, 0.05, 3);
    },
    collapse: function (tall) {
      var t = ctx.currentTime, len = 1 + Math.min(1.8, (tall || 40) / 50);
      noise(t, len, 'lowpass', 700, 60, 0.9, 0, 0.5);
      sweep('sine', t, len * 0.8, 70, 25, 0.8);
      for (var i = 0; i < 6; i++) noise(t + Math.random() * len * 0.7, 0.12, 'bandpass', 1500 + Math.random() * 2000, 600, 0.25, 2);
    },
    heavy: function () { var t = ctx.currentTime; sweep('sine', t, 0.35, 120, 30, 1); noise(t, 0.3, 'lowpass', 1200, 100, 0.7, 0, 0.3); },
    hurt: function () { var t = ctx.currentTime; sweep('sawtooth', t, 0.25, 180, 60, 0.35); noise(t, 0.2, 'bandpass', 900, 300, 0.4, 2); },
    swing: function () { var t = ctx.currentTime; noise(t, 0.22, 'bandpass', 500, 2600, 0.45, 2.5); },
    whip: function () { var t = ctx.currentTime; noise(t, 0.4, 'bandpass', 300, 1800, 0.6, 2); },
    stomp: function () { var t = ctx.currentTime; sweep('sine', t, 0.22, 70, 28, 0.7); },
    laser: function () { var t = ctx.currentTime; sweep('square', t, 0.4, 1600, 250, 0.12); noise(t, 0.3, 'highpass', 3000, 1500, 0.15); },
    zap: function () { var t = ctx.currentTime; sweep('sawtooth', t, 0.45, 900, 1300, 0.12); noise(t, 0.45, 'bandpass', 3000, 1500, 0.25, 4); },
    shot: function () { var t = ctx.currentTime; noise(t, 0.12, 'bandpass', 1300, 400, 0.3, 1); },
    pickup: function () { var t = ctx.currentTime; [660, 880, 1320].forEach(function (f, i) { sweep('triangle', t + i * 0.07, 0.15, f, f, 0.3); }); },
    select: function () { var t = ctx.currentTime; sweep('triangle', t, 0.08, 880, 880, 0.25); },
    secret: function () { var t = ctx.currentTime; ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach(function (n, i) { sweep('triangle', t + i * 0.07, 0.14, freq(n), freq(n), 0.25); }); },
    alarm: function () { var t = ctx.currentTime; for (var i = 0; i < 3; i++) { sweep('square', t + i * 0.5, 0.25, 880, 880, 0.08); sweep('square', t + i * 0.5 + 0.25, 0.25, 660, 660, 0.08); } },
    splat: function () { var t = ctx.currentTime; noise(t, 0.35, 'lowpass', 900, 150, 0.5); },
    honk: function () { var t = ctx.currentTime; sweep('square', t, 0.18, 440, 430, 0.05); }
  };

  function sfxPlay(name, a) { if (!ctx || muted) return; try { fx[name](a); } catch (e) { console.warn('sfx', name, e); } }

  function breath(on) {
    if (!ctx) return;
    if (on && !breathNode && !muted) {
      var t = ctx.currentTime;
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), o = ctx.createOscillator(), og = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2;
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.45, t + 0.2);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(160, t + 0.5);
      og.gain.value = 0.07;
      s.connect(f); f.connect(g); g.connect(sfx); o.connect(og); og.connect(sfx);
      var w = ctx.createGain(); w.gain.value = 0.3; g.connect(w); w.connect(verb);
      s.start(t); o.start(t);
      breathNode = { s: s, o: o, g: g, og: og };
    } else if (!on && breathNode) {
      var n = breathNode, t2 = ctx.currentTime;
      n.g.gain.setTargetAtTime(0, t2, 0.06); n.og.gain.setTargetAtTime(0, t2, 0.06);
      n.s.stop(t2 + 0.4); n.o.stop(t2 + 0.4);
      breathNode = null;
    }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.8;
    if (muted) breath(false);
    return muted;
  }

  return { songs: SONGS, roarBuf: function (k) { init(); return makeRoar(k); }, setVol: setVol, init: init, play: play, stop: stopMusic, sfx: sfxPlay, breath: breath, toggleMute: toggleMute, isMuted: function () { return muted; },
    hasVoice: function (v) { return !!(roarFiles[v] && roarFiles[v].some(Boolean)); } };
})();

/* ---------- Musikmanager: eigene Dateien aus music/ haben Vorrang ----------
   Dateinamen (mp3, ogg oder m4a): title, 1984, 1984_boss, 1989, 1989_boss, 1989_final, 1991, 1991_boss, 1991_final, 1992, 1992_boss, 1992_final, 1993, 1993_boss, 1993_final, 1994, 1994_boss, 1994_final, 1995, 1995_boss, 1995_final, 1995_end, gameover, win – siehe music/README.md.
   Fehlt eine Datei, spielt das Synth-Stück. Die Suche wird pro Platz gemerkt. */
const SLOTS = {
  title: { file: 'title', synth: 'heisei', loop: true },
  level: { file: '1984', synth: 'tokyo', loop: true },          // level/boss stellt Music.setLevel() je Level um
  boss: { file: '1984_boss', synth: 'superx', loop: true },
  final: { file: '1989_final', synth: 'biollante', loop: true },   // level/boss/final stellt Music.setLevel() um
  over: { file: 'gameover', synth: 'over', loop: false },
  win: { file: 'win', synth: 'win', loop: false },
  end: { file: '1995_end', synth: 'requiem', loop: false },     // 1995: Godzillas Tod (Kernschmelze)
};
const EXT = ['mp3', 'ogg', 'm4a'];
const found = {};
let current = null, slotName = '';

function probe(name) {
  if (name in found) return Promise.resolve(found[name]);
  return EXT.reduce((p, ext) => p.then(hit => hit || new Promise(res => {
    const a = new Audio();
    a.preload = 'auto';
    a.oncanplaythrough = () => res(a.src);
    a.onerror = () => res(null);
    a.src = `music/${name}.${ext}`;
  })), Promise.resolve(null)).then(src => (found[name] = src));
}

export const Music = {
  volume: 0.6,
  async play(slot) {
    if (slot === slotName) return;
    slotName = slot;
    const S = SLOTS[slot];
    if (current) { current.pause(); current = null; }
    Sound.stop();
    const src = await probe(S.file);
    if (slot !== slotName) return;                // inzwischen umgeschaltet
    if (src) {
      current = new Audio(src);
      current.loop = S.loop;
      current.volume = Sound.isMuted() ? 0 : this.volume;
      current.play().catch(() => {});
    } else {
      Sound.play(S.synth);
    }
  },
  mute(m) { if (current) current.volume = m ? 0 : this.volume; },
  // Musik des gewählten Levels: { level: [Datei, Synth], boss: [Datei, Synth] }
  setLevel(m) { for (const k in m) Object.assign(SLOTS[k], { file: m[k][0], synth: m[k][1] }); },
};
