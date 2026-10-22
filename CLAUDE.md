# Godzilla – Heisei (Godzilla Game V2)

Neues Godzilla-Spiel: Man steuert Godzilla, ein Level pro Film der **Heisei-Ära** (1984–1995), düsterer Heisei-Ton,
Kamera schräg von oben wie im ersten Spiel, aber moderne 3D-Grafik. Alle Modelle (Godzilla, Gebäude, Fahrzeuge)
werden per Python-Skript in **Blender** erzeugt und als `.glb` exportiert; das Spiel läuft im Browser mit **Three.js**
(PWA, keine Build-Tools, wie Teil 1). Kommunikation mit dem Nutzer auf **Deutsch**.

Vorgänger (Teil 1, 2D-Canvas): https://github.com/alpreuss-svg (Repo `godzilla-game`) – dessen `js/audio.js`
(WebAudio-Orchester-Synth + synthetischer Schrei) soll für V2 als ES-Modul übernommen werden.

## Rahmenbedingungen
- Ziel-Hardware mindestens: Intel UHD 615, i7-8500Y, 8 GB RAM → wenige Draw Calls (InstancedMesh für Gebäude),
  moderate Polygonzahlen, Effekte in Qualitätsstufen, Schatten nur in kleinem Bereich um Godzilla.
- **Musik:** Filmmusik (Ifukube, Sugiyama, Koroku, Hattori) ist urheberrechtlich geschützt → nie ins Repo.
  Lösung: Ordner `music/` ist gitignored; das Spiel spielt dort liegende eigene Dateien des Nutzers,
  sonst eigene, im Stil komponierte Synth-Stücke. Vorgeschlagene Zuordnung:
  1984 „Main Title“/Super-X-Marsch (Koroku) · 1989 „Bio Wars“/Super-X2 (Sugiyama) · 1991 Main Title/Mecha-King Ghidorah (Ifukube)
  · 1992 Mothras Lied/Battra (Ifukube) · 1993 G-Force-Marsch/Rodan (Ifukube) · 1994 SpaceGodzilla/Moguera-Marsch (Hattori)
  · 1995 Destoroyah-Thema, Abspann „Godzillas Tod“ (Ifukube).

## Einrichtung auf einem neuen PC
1. Blender installieren: `winget install --id BlenderFoundation.Blender -e` (entwickelt mit Blender 5.2 LTS).
2. Modelle neu bauen (optional, die `.glb` liegen schon im Repo):
   `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P blender/build_assets.py -- godzilla,city,units --preview`
   Vorschaubilder landen in `tools/previews/` (nicht im Repo) und können zur Kontrolle angesehen werden.
3. Lokaler Server: `powershell -ExecutionPolicy Bypass -File tools\serve.ps1` → http://localhost:8123

## Aufbau
- `blender/build_assets.py` – Einstieg; Argument wählt `godzilla`, `city`, `units`.
- `blender/common.py` – Szene, Materialien (sRGB → linear), Bilder aus numpy, glTF-Export, Workbench-Vorschau,
  EEVEE-Nachtvorschau (zeigt Emission).
- `blender/godzilla.py` – Körper aus **Metaballs** entlang eines Skelettgraphen (Skin-Modifier war lückenhaft),
  dezimiert auf ~26k Dreiecke, Hautrelief per Voronoi-Rauschen, Vertexfarben (`Col`), Augen/Klauen per Raycast,
  Maulhöhle = zwei negative Metaball-Ellipsoide; Zähne (14 oben/14 unten) per senkrechtem Spaltenscan durch die Höhle,
  Rückenplatten (3 Reihen, Material `GZ_Plates`), eigenes Rig + eigene Gewichtung (Distanz zu Knochensegmenten).
  Blender: Z oben, Godzilla schaut nach −Y (im glTF +Z). Größe ~80 m.
- `blender/gz_anim.py` – Animationen als Actions: idle, walk, roar, breath, clawL, clawR, tail, hit, down, death.
- `blender/city.py` – Gebäudebaukasten mit prozeduralen Fassaden (Tag + leuchtende Nachtfenster als Emission),
  Typen `B_tower_glass`, `B_tower_tri`, `B_tower_slab`, `B_tower_step`, `B_office_a/b/c`, `B_apt_a/b`, `B_shop_a/b`,
  `B_house_a/b`, `B_warehouse`, `B_oiltank`, `B_rubble`. Läuft unter Blender 5.2, Tag- und Nachtvorschau geprüft.
  Custom Property `size` (Breite, Tiefe, Höhe in m) landet als glTF-`extras` im Export.
- `blender/units.py` – Panzer Typ 74, Raketen-LKW, AH-1 (+ Rotor separat), **Super-X**, Auto, Yamanote-Zug, Frachter,
  Baum, Laterne, Strommast, Trümmer (`U_debris0..2`). Läuft unter Blender 5.2, Vorschau geprüft.
- `vendor/three/` – Three.js 0.170.0 (build + GLTFLoader, BufferGeometryUtils, SkeletonUtils), per Importmap.
- `assets/models/godzilla.glb`, `city.glb`, `units.glb` – aktuelle Exporte.

## Stand
Erledigt: Repo, Three.js eingebunden, Godzilla-Modell + Rig + Animationen exportiert. Auf dem zweiten PC (Blender 5.2.3)
geprüft: Silhouette und Platten gut; Maulhöhle vergrößert und Zähne neu gesetzt (vorher ragten die unteren aus dem Kinn),
Maul öffnet sich in der `breath`-Pose sauber (Vorschau `godzilla_breath.png`). `city.glb` und `units.glb` gebaut,
keine API-Fehler. Kleinigkeit offen: Kinnspitze bei offenem Maul etwas kantig.

Nächste Schritte für den Prototyp „Tokio 1984 – Die Rückkehr“:
1. (erledigt) Godzilla-Vorschau prüfen, `city` und `units` bauen.
2. Spiel: `index.html` (Importmap), `js/main.js` (Laden, Schleife, Zustände), Godzilla-Steuerung
   (WASD kamerarelativ, J Klauen-Kombo, K halten = Atomstrahl, Platten laden vom Schwanz zum Hals per Shader auf
   Basis der Bind-Pose-Position z, L Brüllen, R Kernpuls, Q/E Kamera drehen, Gamepad), Stadt aus InstancedMesh,
   Zerstörung (Einsinken + Kippen + Staub + Schuttmodell), Militär (Panzer, LKW, Hubschrauber),
   Bossphase **Super-X** mit Kadmium-Geschossen (Godzilla sackt zusammen → `down`) – Schwachstelle wie im Film:
   ein einstürzendes Hochhaus auf sie fallen lassen.
3. Nachtstimmung: Nebel, Regen, Suchscheinwerfer, Brände mit wenigen Punktlichtern, ACES-Tonemapping, Filmkorn/Vignette per CSS.
4. Audio: `audio.js` aus Teil 1 portieren, Musikmanager (erst `music/`, sonst Synth), neue düstere Stücke im Heisei-Stil.
5. HUD (Lebens-/Energieleiste, Ziel, Bossleiste), Boss-Auftritt mit schwarzen Balken, Bewertung, Service Worker.
