# Godzilla – Heisei (Godzilla Game V2)

Neues Godzilla-Spiel: Man steuert Godzilla, ein Level pro Film der **Heisei-Ära** (1984–1995), düsterer Heisei-Ton,
Kamera schräg von oben wie im ersten Spiel, aber moderne 3D-Grafik. Alle Modelle (Godzilla, Gebäude, Fahrzeuge)
werden per Python-Skript in **Blender** erzeugt und als `.glb` exportiert; das Spiel läuft im Browser mit **Three.js**
(PWA, keine Build-Tools, wie Teil 1). Kommunikation mit dem Nutzer auf **Deutsch**.

Vorgänger (Teil 1, 2D-Canvas): https://github.com/alpreuss-svg/godzillagame – dessen `js/audio.js`
(WebAudio-Orchester-Synth + synthetischer Schrei) ist als ES-Modul in `js/audio.js` übernommen.

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
  Blender: Z oben, Godzilla schaut nach −Y (im glTF +Z). Größe ~80 m, Rumpf etwas schlanker als zuerst. Vorbild für
  Schwanz und Platten ist die 1984er Figur (zwei Bilder vom Nutzer): Schwanz ~100 m, wächst tief und ohne Einbuchtung
  aus dem Becken, erstes Viertel fast hüftbreit und hochoval (Ellipsoid-Kette), im zweiten und dritten stark verjüngt,
  im letzten kaum noch (Seil); Ruhepose = S-Bogen aus Bild 1 (am Boden, Bogen nach oben, stumpfe Spitze senkt sich),
  Querringe mit dunklen Rillen (`tail_ring`), Körper mit 32k Dreiecken, damit die Ringe sichtbar bleiben.
  Plattengröße nach Metern entlang der Wirbelsäule (`bell`): Maximum zwischen Brust und Bauch, zum Hals schnell, zum
  Schwanz langsam kleiner, kleiner Zackenkamm bis ans Ende; Seitenreihen enden in der Schwanzmitte.
- `blender/gz_anim.py` – Animationen als Actions: idle, walk, roar, breath, clawL, clawR, tail, hit, down, death, turn.
  Klauenhieb: hoch und nach außen ausholen, diagonal über den Körper schlagen, Oberkörper dreht mit (`ARM_OUT`
  = Vorzeichen fürs Abspreizen). `turn`: Treten auf der Stelle (IK), für das Drehen im Stand.
  **Gang und Stand per inverser Kinematik** (`leg_ik`, Seitenebene, Knie nach vorn): Knöchel steht auf Bodenhöhe 5,6 m,
  ein aufgesetzter Fuß wandert relativ zum Körper mit genau Laufgeschwindigkeit nach hinten. Zyklus 1,75 s, 35 m
  (`WALK_DIST / WALK_T` = 20 m/s) – `WALK_SPEED` in `js/godzilla.js` muss dazu passen, sonst gleiten die Füße.
  Die Hüfte dreht/kippt beim Gehen nicht (sonst wandern die Hüftgelenke), das Wiegen steckt in `spine1`.
- `blender/city.py` – Gebäudebaukasten mit prozeduralen Fassaden (Tag + leuchtende Nachtfenster als Emission),
  Typen `B_tower_glass`, `B_tower_tri`, `B_tower_slab`, `B_tower_step`, `B_office_a/b/c`, `B_apt_a/b`, `B_shop_a/b`,
  `B_house_a/b`, `B_warehouse`, `B_oiltank`, `B_rubble`. Läuft unter Blender 5.2, Tag- und Nachtvorschau geprüft.
  Turmhöhen 106–152 m (ein Versuch mit 170–214 m war dem Nutzer zu hoch – er prüft die alten Werte noch einmal
  aus der Stadt heraus). Wände sind in ein 12-m-Raster geteilt (`CELL`), damit der Spiel-Shader sie eindellen und
  knicken kann. Schutt: zwei Varianten `B_rubble`/`B_rubble_b` (runder Hügel, Betonplatten, Fassadenbrocken mit
  Fenstern, Stahlträger, verkohlte Brocken).
  Custom Property `size` (Breite, Tiefe, Höhe in m) landet als glTF-`extras` im Export.
- `blender/units.py` – Panzer Typ 74, Raketen-LKW, AH-1 (+ Rotor separat), **Super-X**, **Super-X2** (dunkler
  Pfeilrumpf, Triebwerksgondeln, goldener Fire Mirror am Bug, Material `mirror`), Auto, Yamanote-Zug, Frachter,
  Baum, Laterne, Strommast, Trümmer (`U_debris0..2`). Läuft unter Blender 5.2, Vorschau geprüft.
- `vendor/three/` – Three.js 0.170.0 (build + GLTFLoader, BufferGeometryUtils, SkeletonUtils), per Importmap.
- `assets/models/godzilla.glb`, `city.glb`, `units.glb` – aktuelle Exporte.
- `index.html` + `css/style.css` – Importmap, HUD (Leben/Energie), Lade-, Titel- und Pausenbildschirm, Vignette.
- `js/main.js` – Renderer (ACES, Schatten nur vom Mond um Godzilla), Nachtlicht (Hemisphäre, Mond als Gegenlicht im
  Norden, kameragebundenes Fülllicht), Laden, Zustände `loading → title → play ⇄ pause`, kleiner Event-Bus
  (`attack`, `stomp`, `roar`, `breath`, `shake`). Qualität per `?q=low|mid|high`.
- `js/input.js` – Tastatur + Gamepad (Standard-Mapping: A Klaue, X Atomstrahl, Y Brüllen, B Kernpuls, Start Pause).
- `js/camera.js` – **feste** Kamera schräg von oben (Pitch 0,92 rad, Abstand 460 m), blickt nach **Norden** – kein
  Drehen (Wunsch des Nutzers: kein Third-Person-Gefühl; Nordosten wurde probiert und verworfen, `YAW`). Gesteuert wird
  nach Himmelsrichtung (W = Norden). Mausrad zoomt 320–620 m, Erschütterung bei Treffern. Start: Südwesten der
  Karte in der Bucht (`main.js`), Shinjuku liegt in der Kartenmitte (~35 s Weg).
- `js/buildings.js` – Shader-Patch aller Stadtmaterialien (doppelseitig): Durchsicht-Kreis (Kegel Kamera→Godzilla,
  gerastert verworfen, Uniforms in `seeThrough`), Schaden je Instanz über `aDmg` (Schaden, Trefferpunkt lokal):
  Delle + Bröseln im Vertex-Shader, Löcher mit dunklen Innenwänden, Ruß und Glutränder am Einschlag, verteilte
  Ruß-/Rissflecken und ausfallende Fenster überall (damit man den Schaden von jeder Seite sieht), `aFx` (−1 = Schutt,
  Bruchhöhe, Knickwinkel, Knickachse) für das Knicken kippender Türme und verglimmende Glut im Schutt.
- `js/godzilla.js` – Bewegung nach Himmelsrichtung (dreht träge, geht nur in Blickrichtung), 20 m/s, Gebäude bremsen
  erst ab 14 m Höhe (bis 12 / 8 / 4 m/s); die Laufanimation
  ist ab 30 % Tempo voll gewichtet und läuft mit Zeitskala = Tempo/`WALK_SPEED` (Füße bleiben synchron); beim Anlaufen
  steigt sie in der Phase ein, in der der linke Fuß unter dem Körper steht (`WALK_ENTRY`, sonst rutschen die Füße).
  Drehen: Trägheit (max. 63°/s, `TURN_ACCEL`), gedreht wird um den Standfuß und fast nur, solange ein Fuß in der
  Luft ist; im Stand Trittanimation `turn`; prozedural eilen Kopf, Hals und Oberkörper gestaffelt voraus (`LEAD`,
  `LEAD_RATE`: Kopf zuerst, dann Hals, dann Oberkörper, zuletzt Hüfte; Kopf bis ~37° je Seite gegenüber der Hüfte –
  ~60° war dem Nutzer zu weit und zu schnell; gedreht um
  die echte Senkrechte), im Stand schaut er sich leicht um, der Schwanz schleift nach (`tailLag`) und schlängelt sich
  ständig kräftig von links nach rechts (Spitze ±27 m) und hebt sich alle 11 s vom S-Bogen zum steilen J-Bogen aus
  Bild 2 (`TAIL_J`, `J_PERIOD`; Spitze 14–56 m hoch), beim Angriff nicht. **Achtung:** der AnimationMixer schreibt Knochen nur bei geänderten Werten – prozedurale
  Zusatzdrehungen darum immer über `offset()`/`restorePose()` (sonst addieren sie sich bei gehaltenen Posen auf).
  Atemstrahl: Oberkörper-Clip `breathUpper`, die Beine kommen aus `idleLegs`/`turnLegs` (treten beim Schwenken);
  der Strahl folgt der Kopfrichtung (Maul minus Kopfknochen), reagiert also sofort, der Körper zieht nach.
  Animationsmischung (Einzel-
  animationen werden über idle/walk geblendet, Gewichte summieren sich zu 1), Kombo clawL → clawR → tail (volle
  Körperdrehung; Schaden über die echten Positionen der Schwanzglieder `TAIL_SEG`: dicke Wurzel hart, Spitze schwach,
  voll nur im 90°-Sektor vorn, seitlich schwächer ohne Schwanzende, hinten kaum, jedes Gebäude einmal), Atomstrahl (Laden 1,1 s, Platten-Shader nach Bind-Pose-Höhe y, Strahl 20 Energie/s), Kernpuls
  (30 Energie, Radius 130 m), Stampfer über die Knöchelhöhe. Knochennamen ohne Punkt (`footL`, GLTFLoader).
- `js/ground.js` – Bodenschäden: `GroundScars` = Schadenskarte über die Stadt (Canvas 1024², ~3 m/px, additiv bemalt,
  max. 4 Uploads/s; R Ruß/Glut, G Staub/Splitt, B Krater/Risse), Boden-Shader `patchGround` liest sie in
  Weltkoordinaten (Staubfelder lassen Schutt in den Boden übergehen, frische Strahlspuren glühen). Für scharfe Details
  `Decals` (InstancedMesh-Quadrate mit Canvas-Textur): formlose Einschläge bei jedem Stampfer (keine Fußform – sah
  wie Spinnensymbole aus), Einsturzstellen mit kurzen Rissen und Rußflecken (lange Risslinien wirken wie Spinnenbeine).
- `js/military.js` – Militär: Panzer Typ 74, Raketen-LKW, AH-1 (Modelle aus `units.glb`, 1,4-fach skaliert, damit man
  sie sieht). Wellen (`updateWaves`) alle 20–34 s, eskalieren langsam, max. 9 Einheiten, eine Welle kommt geschlossen
  aus einer Richtung. Militär soll nur stören – gefährlich erst, wenn man es lange ignoriert. Bodentruppen fahren
  L-förmig über das Straßenraster zu einer Kreuzung in Schussweite, Hubschrauber kreisen in ~50 m Höhe. Geschosse
  (Leuchtspur, Lenkraketen mit Rauch) streuen so, dass etwa die Hälfte danebengeht; Treffer über eine Kapsel um
  Godzillas Rumpf (`takeDamage`, Zucken bei Trefferserien, nach 3 s ohne Treffer Erholung 1,5/s). Nachts sichtbar
  durch Scheinwerfer mit Lichtkegel bzw. Suchscheinwerfer und Blinklicht. Godzilla zerstört Einheiten mit allen
  Angriffen; der Atomstrahl erfasst beim Laden die nächste Einheit im vorderen Kegel und folgt ihr (`AIM_*`).
  Wracks rauchen 25 s, Hubschrauber stürzen trudelnd ab.
- `js/boss.js` – Super-X: erscheint ab 120 zerstörten Gebäuden (`BOSS_AT` in main.js) mit Kinobalken, neue Wellen
  stoppen. Fliegt über den Hochhäusern an (`ALT_TRAVEL`, sonst blieb sie an Umeda hängen), schwebt dann in 130–190 m
  Abstand auf ~68 m Höhe, weicht Hochhäusern aus (`avoid`; beim Anstoßen kreist sie schneller weiter), feuert nur mit freier Sicht
  (sonst kreist sie schneller weiter), Geschosse explodieren an Gebäuden. Bordgeschütz; Kadmium (alle 18 s zwei Raketen,
  `cadmium()`: 3,5 s wehrlos) nur, wenn Godzilla im Hochhausviertel steht – sonst nagelt sie ihn auf dem Weg fest. Kadmium-Raketen lassen sich mit
  dem Strahl erfassen und abschießen. Gepanzert: Strahl nur 1,5/s. Schwachstelle wie im Film: ein kippendes Hochhaus,
  dessen Fall-Linie unter ihr durchgeht (`topple`-Ereignis), 38 Schaden – drei Türme. Absturz → Sieg → Bewertung.
  Der Atomstrahl endet am Rumpf (`rayHit`). **`SuperX2`** (1989, Unterklasse): Raketensalven statt Kadmium (2,5 Schaden,
  betäuben nicht), Godzilla erfasst sie selbst mit dem Strahl. Fire Mirror: schluckt den Strahl und wirft ihn golden
  auf Godzilla zurück (4 Leben/s, ohne Zurückzucken), glüht mit der Hitze auf; nach 4 s Strahl (`MELT`, kühlt 0,25/s ab)
  schmilzt er, danach trifft der Strahl mit 8/s. Hochhaus-Falle wirkt weiter.
- `js/atmosphere.js` – Nachtstimmung: Regen (LineSegments in einem Kasten um den Blickpunkt), 5 Flak-Suchscheinwerfer
  (additive Kegel auf Kreuzungen um Godzilla, tasten ihn ab), feste Anzahl Punktlichter an den nächsten Bränden
  (Anzahl je Qualitätsstufe, nie wechselnd – sonst übersetzt Three.js die Shader neu). Filmkorn per CSS (`#grain`).
- `js/audio.js` – Audio aus Teil 1 als ES-Modul (`Sound`: Orchester-Synth, Schrei als gestrichene Saite, Effekte) plus
  eigene Heisei-Stücke (`heisei` Titel, `tokyo` / `superx` für 1984, `osaka` / `superx2` für 1989). `Music` spielt pro
  Platz (title, level, boss, over, win; level/boss stellt `Music.setLevel()` je Level um) zuerst eine eigene Datei aus `music/` (Namen in music/README.md; die 404-Meldungen beim
  Suchen sind gewollt), sonst das Synth-Stück. Ton startet mit der ersten Taste (Browser-Regel), M schaltet stumm.
  Ereignis → Geräusch in `hookSounds()` (main.js), häufige Ereignisse gedrosselt.
- `js/minimap.js` – Mini-Map oben rechts (Gebäude, Flüsse, Parks, Zerstörung, Godzilla als Pfeil, Militär, Boss).
- `js/levels.js` – Level je Film: Stadtplan (`layout`), Start, Boss, Musik (Datei + Synth), Texte. Auswahl per
  `?level=1989` oder im Titelbild mit 1/2 (lädt neu, andere Parameter bleiben). **1984 Tokio** (Shinjuku, Super-X),
  **1989 Osaka** (Umeda-Hochhäuser nördlich des Flusses, Fluss quer in Reihe j = 1, südlich Dōtonbori als Zone `neon`,
  Burgpark im Osten, Hafen; Boss Super-X2). Biollante als Endgegner fehlt noch.
- `js/effects.js` – Strahl und Schockwelle als additive Shader, keine Postprocessing-Passes; `Particles` (ein
  `Points`-Pool, Farbe pro Partikel, Punktgröße auf 18 % der Bildhöhe gedeckelt – große Punkte kosten auf schwachen
  GPUs viel Füllrate): `fx.dust` für Staub und Rauch, `fx.fire` additiv mit Farbverlauf gelb→rot,
  Trümmer (InstancedMesh aus `U_debris0..2`, Schwerkraft, ein Abpraller).
- `js/city.js` – Stadt: Raster 136 m, Kartenform je Level über `layout` (`DEFAULT_LAYOUT`: 6 Blöcke vom Zentrum,
  Bucht ab Reihe 4,5, Hochhausviertel in der Mitte – eine größere Karte war dem Nutzer zu groß; optional eigene
  `zoneOf`, `rivers` als Wasserstreifen, `parks` als Wiese über leeren Blöcken), Zonen (Türme, Büros, Wohn-/Ladenviertel,
  Hafen, `neon`), `city.extent`/`bayZ`/`center` für andere Module,
  Bucht südlich `BAY_Z`, ein InstancedMesh pro Typ und Material (~46 Draw Calls bei ~3900 Gebäuden),
  Raycast für den Strahl (ignoriert Gebäude, in denen das Maul steckt). Zerstörung: HP = 20 + 2,5·Höhe;
  `damage()` (Umkreis, Abfall, Trefferhöhe `height`), `crush()` (Godzillas Körper, 320 Schaden/s, bremst auf 5 bzw.
  2,5 m/s). Jeder Treffer: Schaden sichtbar im Shader, Zittern, Brocken und Staub am Einschlag; ab 45 % neigt sich
  das Gebäude vom Angreifer weg, ab 55 % brennt es (max. 40 Brände). Einsturz unter 70 m: das Gebäude staucht sich
  Stockwerk um Stockwerk zusammen, kippt leicht, sinkt in die eigene Staubwolke, Brocken fallen von oben, eine
  Staubwalze rollt über die Straßen. Ab 70 m kippt es weg vom Angreifer und knickt an einer Bruchstelle; der Aufschlag
  zerschlägt alles darunter (Kettenreaktion) und meldet `topple` (für den Super-X-Boss gedacht). Danach Schutthaufen
  (zufällige Variante und Drehung, fast gleichmäßig skaliert – gestreckt sah er wie Splitter aus; umgestürzte Türme
  als Kette von Haufen), der 45 s glimmt, anfangs brennt und raucht. Im Schutt leuchten keine Fenster.
  Teilruinen: 45 % der Gebäude ab 12 m brechen nur oben ab (Abbruchhöhe sinkt, Shader verwirft alles darüber mit
  gezackter, verrußter Kante), jeder zweite gekippte Turm lässt einen Stumpf stehen; innen und daneben liegt Schutt.
  Schaden: Klaue 60, Schwanz bis 140 (dickste Stelle, vorn),
  Kernpuls 140 (130 m, Abfall), Strahl 220/s, Stampfer 60 (14 m).

## Testen
Server starten (`tools\serve.ps1`, auch als `.claude/launch.json` für die Browser-Vorschau). Mit `?debug` läuft der
Renderer mit `preserveDrawingBuffer`; `game.step(dt)` rechnet einen Frame von Hand (auch wenn das Fenster verborgen ist
und `requestAnimationFrame` pausiert), Tasten lassen sich per `dispatchEvent(new KeyboardEvent('keydown', {code}))` simulieren.
`game.manual = true` hält die eigene Schleife an, damit Screenshots genau den von Hand gerechneten Stand zeigen.

## Stand und Fahrplan
Level „Tokio 1984 – Die Rückkehr“ spielbar, „Osaka 1989“ mit Super-X2 spielbar (Biollante folgt). Die Schritte stammen vom ersten PC:
1. **Erledigt** – Modelle: Godzilla geprüft (Maul, Zähne), `city` und `units` gebaut. Offen: Kinnspitze etwas kantig.
2. **Spiel – in Arbeit.** Erledigt: Spielgerüst, Steuerung (Gang und Drehen per IK, Kombo, Atomstrahl, Kernpuls, Brüllen),
   feste Kamera, Teststadt, Zerstörung (sichtbarer Schaden, Brände, Einsturz, Teilruinen, Schutt, Bodenschäden).
   (erledigt) Militär mit Wellen, Beschuss, Lebensverlust, Zielerfassung des Strahls; Bossphase Super-X mit
   Kadmium und Hochhaus-Falle; Niederlage/Sieg mit Endbildschirm und Bewertung. Gamepad nicht mit echtem Gerät getestet.
3. **Nachtstimmung** – erledigt: ACES, Vignette, Brände/Rauch/Glut, Regen, Flak-Scheinwerfer, Brandlicht, Filmkorn.
4. **Audio** – erledigt: Teil-1-Audio portiert, Musikmanager, drei Heisei-Stücke, Effekte an allen Ereignissen.
   Noch nicht angehört (Tests liefen ohne Ton) – Lautstärken ggf. nachstellen.
5. **HUD und Rahmen** – erledigt: Leben/Energie, Zähler, Ziel, Bossleiste, Kinobalken, Meldungen, Endbildschirm mit
   Bewertung, PWA (`manifest.webmanifest`, `sw.js`: Netz zuerst, Cache offline; mit `?nosw` abschaltbar; bei neuen
   Dateien `ASSETS` und `VERSION` in sw.js anpassen).
Außerdem offen: echte GPU-Last auf der UHD 615 prüfen (~230k Dreiecke, Partikel, bis ~80 Draw Calls), Lautstärken
anhören, Balance (Wellen, Schaden, Bossphase) im echten Spiel prüfen, 1989: Biollante als Endgegner (Rosen-Form,
dann Monsterform), weitere Level (1991 King Ghidorah usw.).
