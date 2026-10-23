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
   `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P blender/build_assets.py -- godzilla,city,units,biollante,ghidorah,mothra,kaiju93,kaiju94,kaiju95 --preview`
   Vorschaubilder landen in `tools/previews/` (nicht im Repo) und können zur Kontrolle angesehen werden.
3. Lokaler Server: `powershell -ExecutionPolicy Bypass -File tools\serve.ps1` → http://localhost:8123

## Aufbau
- `blender/build_assets.py` – Einstieg; Argument wählt `godzilla`, `city`, `units`, `biollante`, `ghidorah`, `mothra`,
  `kaiju93`, `kaiju94`, `kaiju95`.
- `blender/common.py` – Szene, Materialien (sRGB → linear), Bilder aus numpy, glTF-Export, Workbench-Vorschau,
  EEVEE-Nachtvorschau (zeigt Emission), `color_preview` (EEVEE bei Tageslicht: Vertexfarben, Texturen und Emission
  zusammen – zum Vergleich der Modelle mit Fotos; die Workbench zeigt nur eins davon).
  **Achtung:** `noise.noise(..., noise_basis='VORONOI_F2F1')` liefert Werte von −1 bis 1 (Median ≈ −0,68); Fugen und
  Plattenränder darum mit Schwellen um −0,95 auswählen (eine Schwelle wie 0,08 traf fast alle Punkte).
- `blender/godzilla.py` – Körper aus **Metaballs** entlang eines Skelettgraphen (Skin-Modifier war lückenhaft),
  dezimiert auf ~26k Dreiecke, Hautrelief per Voronoi-Rauschen, Vertexfarben (`Col`), Augen/Klauen per Raycast,
  Maulhöhle = zwei negative Metaball-Ellipsoide; Zähne (14 oben/14 unten) per senkrechtem Spaltenscan durch die Höhle,
  Rückenplatten (3 Reihen, Material `GZ_Plates`), eigenes Rig + eigene Gewichtung (Distanz zu Knochensegmenten).
  **Überarbeitung nach Figurenbildern des Nutzers:** Arme als eigener Metaball-Körper (`build_arms`, verschmilzt
  nicht mit dem Rumpf; Oberarm ~12 m, Unterarm ~10 m, Ellbogen außen/hinten, Hand mit vier Fingern und gebogenen
  Krallen); Armknochen bewegen nur die Arm-Inseln (`arm_range` in `weight`), nie die Rumpfhaut – vorher zog der
  Arm einen Hautlappen von der Brust mit; Armwurzel steckt im Rumpf (keine sichtbare Gelenkkugel), Schultermuskel,
  Oberarm und Unterarm verjüngen sich. Kopf nach dem Bau um `HEAD_PIVOT` vergrößert, aber nur in Länge und Höhe
  (`HEAD_SCALE` = 1,0/1,15/1,18 – gleichmäßig wirkte er von vorn wie ein Froschkopf), gewölbter Schädel, Brauenwülste,
  Nasenkuppe, Auge weiter vorn; `P` der Kopfpunkte mitskaliert. Kräftiger Hals, gewölbte Brustmuskeln über rundem
  Bauch (Bauchrillen nur noch flach in der Mitte), keine Schulterpolster. Oberschenkel nicht schlanker, sondern
  geformt (breit am Becken, Strecker vorn zum Knie schmaler, Beuger hinten); breite Füße mit vier Zehen (`toe_tips`)
  und großen, dicken hellen Krallen – die Beingelenke (`P`) sind unverändert, damit die Gang-IK passt.
  Platten: gelappter Ahornblatt-Umriss (`PLATE_OUTLINE`), dick, hell, zwischen Schultern und Hüfte in voller Größe
  (reichen bis etwa Kopfhöhe, `PLATE_TOP` 73 in godzilla.js), zum Hals hin schnell kleiner; Hals verjüngt sich
  gleichmäßig von den Schultern zum Kopf (lang gezogene Ellipsoide entlang der Halsachse – eine flache Scheibe am
  Ansatz bildete eine Stufe zur Brust; flache Kehle mit Querfalten; Hinterkopf und Schädeldecke ragen nicht über die
  Nackenlinie; flache Kaumuskeln; die Kopfvergrößerung greift nicht auf den Hals über). Kiefer: kräftiger Unterkiefer
  mit Kinn, alles unter der Maullinie vor dem Gelenk gehört dem Kiefer, Mundwinkel/Wangen beiden Knochen (dehnen sich
  beim Öffnen); Brüllen öffnet 26° (38° klappte den Kiefer wie eine Schublade heraus). Bilderbogen `sheet_kopf`; Haut feiner (Borke statt grober Beulen).
  Blender: Z oben, Godzilla schaut nach −Y (im glTF +Z). Größe ~80 m, Rumpf etwas schlanker als zuerst. Vorbild für
  Schwanz und Platten ist die 1984er Figur (zwei Bilder vom Nutzer): Schwanz ~100 m, wächst tief und ohne Einbuchtung
  aus dem Becken, erstes Viertel fast hüftbreit und hochoval (Ellipsoid-Kette), im zweiten und dritten stark verjüngt,
  im letzten kaum noch (Seil); Ruhepose = S-Bogen aus Bild 1 (am Boden, Bogen nach oben, stumpfe Spitze senkt sich),
  Querringe mit dunklen Rillen (`tail_ring`), Körper mit 32k Dreiecken, damit die Ringe sichtbar bleiben.
  Plattengröße nach Metern entlang der Wirbelsäule (`bell`): Maximum zwischen Brust und Bauch, zum Hals schnell, zum
  Schwanz langsam kleiner, kleiner Zackenkamm bis ans Ende; Seitenreihen enden in der Schwanzmitte.
- `blender/gz_anim.py` – Animationen als Actions: idle, walk, roar, roarFwd, breath, clawL, clawR, tail, hit, down, death, turn.
  Schrei wie die Figur (Bild vom Nutzer): Arme schräg nach außen unten, Unterarme nach vorn, Pranken offen; `roar` mit
  Kopf in den Himmel, `roarFwd` mit Kopf waagrecht – das Spiel nimmt `roarFwd`, wenn ein Boss da ist
  (`g.roarTarget` in main.js), und dreht Godzilla während des Schreis zu ihm (Kopf eilt voraus).
  Klauenhieb: seitlich auf Schulterhöhe ausholen (Ellbogen gebeugt, Pranke hinter dem Kopf), dann nach vorn unten
  vor die Brust durchschlagen, Oberkörper dreht mit (`ARM_OUT` = −1: negative Z-Drehung hebt den Arm seitlich – seit
  den freien Armen umgekehrt). `POSTURE`: Oberkörper, Hals und Kopf leicht nach vorn, Blick geradeaus (in allen
  Animationen addiert). `turn`: Treten auf der Stelle (IK), für das Drehen im Stand.
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
  Custom Property `size` (Breite, Tiefe, Höhe in m) landet als glTF-`extras` im Export. Wahrzeichen (nur über
  `specials` eines Levels gesetzt): `B_landmark` (Yokohama Landmark Tower, 186 m, gestuft mit eingezogenen Ecken),
  `B_wheel` (Riesenrad Cosmo Clock, 102 m, leuchtende Gondeln), `B_messe` (Makuhari Messe, flache Halle mit Tonnendach), `B_ftower` (Fukuoka Tower, 234 m, Dreiecksschaft), `B_bigsight` (Tokyo Big Sight, vier umgedrehte Stufenpyramiden).
- `blender/units.py` – Panzer Typ 74, Raketen-LKW, AH-1 (+ Rotor separat), **Super-X**, **Super-X2** (dunkler
  Pfeilrumpf, Triebwerksgondeln, goldener Fire Mirror am Bug, Material `mirror`), Auto, Yamanote-Zug, Frachter,
  Baum, Laterne, Strommast, Trümmer (`U_debris0..2`). Läuft unter Blender 5.2, Vorschau geprüft.
- `blender/pose_sheet.py` – Bilderbogen von Godzilla aus der fertigen glb (hell, einfarbig wie Modellierton, echte
  Animationen): `blender -b --factory-startup -P blender/pose_sheet.py` → `tools/previews/sheet_*.png`.
- `blender/biollante.py` – Biollante nach Bildern vom Nutzer, Metaballs + Rauschrelief + Vertexfarben: `BI_rose`
  (Stamm aus sieben verdrillten Strängen, Wurzeln, hängender Blattkragen, glühender Saftsack, Rose aus sechs Ringen
  runder, gewölbter Blütenblätter mit Zahnkranz-Schlund, ~100 m), `BI_beast` (zottiger Körper, Krokodilkopf mit
  offenem Maul, Zähne per Spaltenscan, Hauer, Stacheln, ausladende Rankenbeine, glühender Kern), `BI_head`
  (Rankenkopf mit aufgerissenem Maul, zeigt nach +Z). Kern/Saftsack: Material `BI_Glow` mit Zellen-Netz-Textur
  (braucht eine UV-Ebene, sonst fehlen die UVs). Die Ranken selbst baut das Spiel.
- `blender/ghidorah.py` – King Ghidorah und Mecha-King Ghidorah (1991) nach Filmbildern des Nutzers, nur starre
  Teile: `GH_body`/`MGH_body` (goldene Schuppen; Mecha zusätzlich Chrom-Brustpanzer, Gürtel, Stiefel), `GH_wing`
  (riesiger Fledermausflügel: Arm, sechs Finger mit Krallen, Membran mit stark gebogtem Hinterrand), `MGH_wing`
  (Nabe, fünf Holme mit roten Lichtern und Antennenspitzen, Gitterplatten `MGH_Mesh` mit Lochblech-Textur),
  `GH_head` (zwei lange Hörner, Stachelkrone, Wangenstacheln), `MGH_head` (Silberplatten, grüne Augen),
  `GH_tailtip` (Stachelbüschel) und `MGH_clamp` (Greifzange) für die Schwanzenden. Gelenkpunkte `NECK_ROOTS`,
  `TAIL_ROOTS`, `WING_ROOT` müssen zu ghidorah.js passen. Vorschau setzt beide mit Röhren als Hälsen zusammen.
- `blender/mothra.py` – Mothra und Battra (1992) nach Filmbildern des Nutzers: `MO_body` (weißer Pelz mit orangen
  Querstreifen, schwarze Flecken unter den Flügeln, große blaue Augen, schwarze Schnauze, kurze gebogene weiße Fühler,
  helle Beine mit gelben Krallen), `MO_wing` (Vorderflügel gelb-orange mit großen schwarzen Flammenflecken aus
  Wertrauschen `vnoise`, Augenring an der Spitze, dicke gelbe Pelzkante `MO_LEAD`; Hinterflügel orange-rot mit
  schwarzen Bögen), `BT_body` (schwarz gepanzert, vorgesetzter Kopf mit Schnauze, Krone aus gelben Hörnern, schräge
  rote Augen, Fangzähne, Krallenarme, rote Flecken am Hinterleib, Zangen), `BT_wing` (schwarz mit verzweigten roten
  Blitzen, gelb gesäumt), `BT_head` (Larvenkopf schiefergrau mit Goldkanten, goldenes Horn schräg nach vorn oben,
  Brauenplatten, rote Schlitzaugen, geschwungene Hauer). Mothras Larve kommt im Spiel nicht vor. Flügel liegen
  waagrecht (XY), linker nach +X, Gelenk `WING_ROOT` (muss zu kaiju.js passen); Muster als Bild aus den Umrissen.
- `blender/kaiju93.py` – nach Filmbildern: Rodan (`RO_body`: rot-orange, heller quer gerippter Hals und Bauch,
  langer dunkler Schnabel, zwei Hörner, Nackenstacheln; `RO_wing` mit geäderter Flughaut als Bild `rodan_image`) und
  Mechagodzilla 1993 als runde Chrompanzerung aus Metaballs (`chrome`: V-Brustpanzer, Bauchlinse, Rückendüsen,
  Echsenkopf mit Kamm und Zahnreihen, massige Oberschenkel mit Seitenplatten, runde Kniepanzer, Vierzehenfüße) in
  Gelenkteilen (`MG_torso`, `MG_head`, `MG_arm`, `MG_thigh`, `MG_shin`, `MG_garuda` mit langen Kanonen; Ursprung je
  Teil im Gelenk `JOINTS`, muss zu kaiju93.js passen).
- `blender/kaiju94.py` – Moguera (`MOG_body` auf Ketten, `MOG_drill` für Nase und Hände, `DRILLS`) und `SG_crystal`
  (Kristallgruppe für Stirnhorn und Kristalltürme), `SG_shoulder` (SpaceGodzillas riesiger Schulterkristall, weiß bis
  rosa mit roter Basis, Vertexfarben).
- `blender/kaiju95.py` – Destoroyah nach Filmbildern: `DE_juvenile` (Krabbe/Skorpion: sechs spitze Beine, zwei
  erhobene Sichelscheren, Stachelkrone, Kieferzangen, beiger Brustfleck), Flugform `DEF_body`/`DEF_wing` (Namen
  passend zu `Moth` in kaiju.js, Flügelwurzel `WING_FLY`), Endform `DE_body` (~110 m, rot mit schwarzbraunen
  Panzerflecken, leuchtende Brustblüte `DE_Flower`, Kopf `demon_head` mit Stachelkragen und gelb-orangem Laserhorn
  `DE_Laser` – Spitze bei Blender (0, −38, 96), passend zu kaiju95.js –, rote Schulterhörner, helle Fuß-/Kniekrallen),
  `DE_wing` (rote gerippte Flughaut, dunkle Fingerknochen, Wurzel `WING_FINAL`), `DE_pincer` (Halbmond-Schere).
- `vendor/three/` – Three.js 0.170.0 (build + GLTFLoader, BufferGeometryUtils, SkeletonUtils), per Importmap.
- `assets/models/godzilla.glb`, `city.glb`, `units.glb`, `biollante.glb`, `ghidorah.glb` – aktuelle Exporte (Monster
  lädt nur das Level, das sie braucht: `models` in levels.js).
- `index.html` + `css/style.css` – Importmap, HUD (Leben/Energie), Lade-, Titel- und Pausenbildschirm, Vignette.
- `js/main.js` – Renderer (ACES, Schatten nur vom Mond um Godzilla), Nachtlicht (Hemisphäre, Mond als Gegenlicht im
  Norden, kameragebundenes Fülllicht), Laden, Zustände `loading → title → play ⇄ pause`, kleiner Event-Bus
  (`attack`, `stomp`, `roar`, `breath`, `shake`). Qualität per `?q=low|mid|high`.
- `js/input.js` – Tastatur + Gamepad (Standard-Mapping: A Klaue, X Atomstrahl, Y Brüllen, B Kernpuls, LB/RB/L3 Sprint,
  Start Pause); Shift = Sprint.
- `js/camera.js` – **feste** Kamera schräg von oben (Pitch 0,92 rad, Abstand 460 m), blickt nach **Norden** – kein
  Drehen (Wunsch des Nutzers: kein Third-Person-Gefühl; Nordosten wurde probiert und verworfen, `YAW`). Gesteuert wird
  nach Himmelsrichtung (W = Norden). Mausrad zoomt 320–620 m, Erschütterung bei Treffern. Start: Südwesten der
  Karte in der Bucht (`main.js`), Shinjuku liegt in der Kartenmitte (~35 s Weg).
- `js/buildings.js` – Shader-Patch aller Stadtmaterialien (doppelseitig): Durchsicht-Kreis (Kegel Kamera→Godzilla,
  gerastert verworfen, Uniforms in `seeThrough`), Schaden je Instanz über `aDmg` (Schaden, Trefferpunkt lokal):
  Delle + Bröseln im Vertex-Shader, Löcher mit dunklen Innenwänden, Ruß und Glutränder am Einschlag, verteilte
  Ruß-/Rissflecken und ausfallende Fenster überall (damit man den Schaden von jeder Seite sieht), `aFx` (−1 = Schutt,
  Bruchhöhe, Knickwinkel, Knickachse) für das Knicken kippender Türme und verglimmende Glut im Schutt.
- **Punkte** (main.js): Gebäude 10 + 2 × Höhe (Häuschen ~26, Hochhaus ~290), Einheiten 60, Boss 2000, Endgegner 3000.
  Der Boss kommt bei `game.bossAt` = Wert von 60 Durchschnittsgebäuden der Stadt (vorher 120 Gebäude – dem Nutzer zu
  lang). Bewertung = Gebäude-Gegenwert pro Minute.
- `js/godzilla.js` – Bewegung nach Himmelsrichtung (dreht träge, geht nur in Blickrichtung), 20 m/s, **Sprint** mit Shift
  ×1,65 (33 m/s, `SPRINT`), kostet 7 Energie/s, solange lädt nichts nach (sonst 6/s, `ENERGY_REGEN`) – Wunsch des
  Nutzers, Godzilla war ihm zu langsam; Laufanimation läuft dann schneller, Füße bleiben synchron. `heal()`: Leben
  durch Zerstörung (`HEAL` in main.js: Hochhaus 6, mittleres Gebäude 1,5, Haus 0,4, Einheit 1; Leiste blinkt grün). Gebäude bremsen
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
  voll nur im 90°-Sektor vorn, seitlich schwächer ohne Schwanzende, hinten kaum, jedes Gebäude einmal), Atomstrahl (Laden 1,3 s: dabei legt er Kopf und Hals in den Nacken und holt Luft (`INHALE_PITCH`, prozedural),
  mit vollen Platten senkt er den Kopf in 0,3 s (`LOWER_T`) und feuert; Platten-Shader nach Bind-Pose-Höhe y,
  Strahl 20 Energie/s), Kernpuls
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
  Wracks rauchen 25 s, Hubschrauber stürzen trudelnd ab. (Ein Atomtransporter zum Heilen gefiel dem Nutzer nicht und
  wurde zurückgebaut.) **Schrei (L)** heilt 15 Leben (`ROAR_HEAL`) und betäubt alles im Umkreis von 450 m
  (`ROAR_RANGE` in main.js; Militär 3 s, Bosse 2,5 s über `stun()` – Super-X schießt nicht, Ghidorahs Blitze und
  Biollantes Ranken/Saft brechen ab), Druckwelle zeigt die Reichweite; danach 20 s Aufladen (`ROAR_CD`), angezeigt als
  goldener Streifen unten in der Lebensleiste (`#roarCd`, leuchtet wenn bereit).
- `js/boss.js` – Super-X: erscheint bei der Boss-Punktzahl (`game.bossAt` in main.js) mit Kinobalken, neue Wellen
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
- `js/chain.js` – biegsame Kette (Schlauch mit 10 Knochen, folgt einer Bezierkurve; optional Kopf an der Spitze und
  Vertexfarben mit Querringen, `ringColor` für eigene Ringfarbe, `spots` für Flankenflecken je Glied) für Biollantes
  Ranken, Ghidorahs Hälse und Schwänze, Battras Larve (schiefergrau, goldene Ringe, rote Flecken), Destoroyahs Schwanz.
- `js/ghidorah.js` – 1991: `KingGhidorah` (Boss-Rolle wie die Super-X; bekommt auch Godzillas `attack`-Ereignisse)
  und `MechaKingGhidorah` (Endgegner-Rolle). Rumpf + Flügel (King schlägt, Mecha fast starr) + 3 Hälse und 2
  Schwänze als Ketten (Mecha-Mittelhals silbern gegliedert, Schwanzenden aus dem glb), Köpfe auf den Halsspitzen.
  Hälse schlängeln sich einzeln, schnell und nervös (eigene Frequenzen, ruckartige Blickwechsel `dart`).
  Fliegt in ~75 m Höhe im Kreis (weicht Hochhäusern aus), landet alle ~20 s für ~11 s in 68 m Abstand (nur dann
  treffen Klaue und Schwanz). Strahlen sind zuckende Blitze (`Lightning` in effects.js: Band zur Kamera, Nebenarme,
  gelb-orange, Mecha-Mittelkopf bläulich), die um Godzilla herum irren (`wander`) und nur ab und zu treffen; daneben
  schlagen sie in Boden und Gebäude ein, Gebäude dazwischen fangen sie ab. Flügellöcher: alle 11 verlorenen
  Lebenspunkte ein Loch (`holeMaterial`: Shader verwirft gezackte Kreise, verkohlter, glühender Rand; max. 8 je
  Flügel). Griffe (Godzilla `held`, nur der Kernpuls befreit, kostet den Gegner 6 bzw. 8; Sicherheits-Zeitgrenze):
  King gelandet – die äußeren Köpfe beißen in Godzillas Schultern, der Mittelkopf feuert aus nächster Nähe; Mecha –
  Greifhaken an zwei Stahlseilen mit Klammer um die Brust. Strahl auf Kopf 6/s, Körper 4/s (Mecha 4/2,5).
  Absturz → `bossCrash` bzw. `finalGone`. Die Blitzbänder brauchen `camera` (setzt main.js).
- `js/kaiju.js` – gemeinsame Helfer der Monster ab 1992: `Moth` (Körper + schlagende Flügel), `orbit` (Kreisflug,
  weicht Hochhäusern aus – im Sturzflug/Flügelsturm abgeschaltet, sonst blieben sie an Türmen hängen), `clearAlt`
  (Tiefflug knapp über den Dächern), `faceTo`, `sphereHit`, `makeBeam`/`fireBeam` (Ziel: Godzillas Brust relativ zu
  seiner Höhe, auch im Wasser). Nahkampf an Fliegern nur im Sturzflug bzw. Flügelsturm.
- `js/kaiju93.js` – 1993: `Rodan` (Boss): fliegt, Sturzflug mit Überschallknall (Druckwelle reißt Gebäude um), besiegt
  Absturz und Rückkehr als glühender Fire Rodan mit Schnabelstrahl; fällt Fire Rodan, geht seine Lebensenergie auf
  Godzilla über (+40 Leben, volle Energie, `g.power` 1,5 = stärkerer Atomstrahl). `Mechagodzilla` (Endgegner): geht
  schwerfällig (Gelenkgruppen, prozeduraler Gang, Schwanz als Kette), Augenlaser, Mega-Buster, Schockanker (halten
  fest, nur der Kernpuls befreit), Plasmagranate (Strahl von vorn macht 30 % Schaden und lädt einen Rückschuss),
  von hinten trifft alles das zweite Gehirn (×2,5); bei halber Kraft dockt Garuda an (Super-Mechagodzilla, Kanonen).
- `js/kaiju94.js` – 1994: `Moguera` (Boss): landet mit Triebwerken, rollt auf Ketten heran (walzt Gebäude nieder),
  Plasma-Maser, Spiralraketen (abschießbar), gräbt sich ein, wühlt mit Staubspur unter der Erde zu Godzilla und bricht
  unter ihm hervor (7 Schaden), danach 2,5 s benommen (doppelter Schaden). `SpaceGodzilla` (Endgegner): umgefärbte
  `SkeletonUtils`-Kopie von Godzilla (eigene Animationen; eigene Geometrie-Kopie mit neuen Vertexfarben: Blau-Violett,
  rote Brust und roter Bauch nach Bind-Pose-Position; Rückenplatten weiß-rosa; `SG_shoulder` an spine2, gelb-oranges
  Stirnhorn am Kopf), schwebt, Korona-Strahl,
  Kristallgeschosse, Gravitationssog (hält fest, nur der Kernpuls befreit). Kraft über den Fukuoka Tower (Schild:
  nur 30 % Schaden, heilt) und 4 Kristalltürme (heilen, zerstörbar), sichtbar als violette Energieströme. Die
  Endgegner-Klasse bekommt alle geladenen Modelle (`models`) als 7. Argument.
- `js/kaiju95.js` – 1995 (Finale): `DestoroyahSwarm` (Boss): 6 Jungtiere kriechen aus der Bucht, umkreisen Godzilla
  im Zickzack, springen ihn an, spucken Mikro-Sauerstoff (purpur); Kernpuls trifft alle (14), Klaue/Schwanz anteilig.
  Sind alle tot, verschmelzen sie (`desMerge`) zur Flugform (`desChange`; Strahl, Sturzflug – nur dann Nahkampf).
  `Destoroyah` (Endgegner): landet, geht langsam heran, Mikro-Sauerstoff-Strahl, Laserhorn schwenkt quer über Godzilla,
  Schwanzschere (`Chain` 105 m) packt ihn und saugt ihn aus (nur der Kernpuls befreit, kostet Destoroyah 8),
  Flugsprünge auf die andere Seite; besiegt steigt er brennend auf und zerbirst. Haut wird nachts aufgehellt (`brighten`).
- `js/moths.js` – 1992: `Battra` (Boss-Rolle) in zwei Stufen – Larve (Kette 120 m mit Kopf, kriecht aus der Bucht,
  folgt ihrer Spur wie eine Schlange, walzt Gebäude nieder, rammt mit dem Horn (6 Schaden, stößt Godzilla zurück),
  roter Prismenstrahl aus dem Horn), besiegt gräbt sie sich ein und steigt als Falter auf (fliegt, rote Strahlen aus
  den Augen, Sturzflug – dann für Klaue/Schwanz erreichbar); `Mothra` (Endgegner-Rolle): gelbe Strahlen aus den
  Fühlern, Schuppenpulver (goldene Glitzerwolke `fx.glow` 8 s, brennt Godzilla in 110 m und wirft den Atomstrahl
  zurück; der Schrei bläst es weg), Flügelsturm (fliegt auf 26 m herab, drückt Godzilla weg, reißt Gebäude um, dann
  für Klaue/Schwanz erreichbar). Strahlen sind schlanke `Beam`s ohne Licht, Gebäude fangen sie ab.
- `js/biollante.js` – Endgegner 1989, startet 7 s nach dem Absturz der Super-X2. **Rosenform** wächst aus dem Fluss
  (steht fest, 6 Ranken), **Bestienform** (8 längere Ranken, kriecht mit 5 m/s auf Godzilla zu und walzt Gebäude nieder).
  Ranken = Schlauch mit 10 Knochen (`SkinnedMesh`), die Kette folgt jedes Bild einer Bezierkurve (Ruhe: S-Bogen nach
  außen/oben, Kopf schaut zu Godzilla; Angriff: ausholen → zuschnellen → Biss, manchmal umschlingen = Godzilla max.
  3 m/s über `g.speedCap`, nur eine Ranke gleichzeitig). Ranken haben 25 HP: Klaue, Schwanz, Kernpuls und Strahl
  reißen sie ab, nach 15 s wachsen sie nach. Ätzender Saft aus Rose bzw. Maul (Partikelstrahl, `fx.glow`).
  **Festhalten** (Szenen aus dem Film, `hold`, Godzilla bekommt `g.held`: kein Gehen, keine Klaue, kein Brüllen):
  Ranken-Fessel (beide Formen, alle ~24 s bzw. ~17 s: drei Ranken, eine durch die linke Handfläche `handL`, zwei um
  Brust/Bauch; nur Atomstrahl oder Kernpuls befreien, die Ranken reißen dabei ab; sonst nach 6 s) und Kopf im Maul
  (nur Bestie, alle ~20 s, wenn Godzilla vorn innerhalb 95 m steht: sie beugt sich vor, Godzilla wird vor ihr
  festgehalten; nur 0,8 s Atomstrahl in den Schlund befreit und kostet sie 12 HP; sonst nach 7 s).
  Abstimmung nach Nutzerwunsch (wie im Film): Rose sehr zäh, wenige Angriffe; Bestie zäh und angriffslustig.
  Schaden an ihr: Strahl 2,2/s (Rose) bzw. 1,6/s, am Kern ×1,5 bzw. ×2; Strahl erfasst Rankenköpfe und Kern (`targets`), endet am Körper
  (`rayHit`); Godzilla kann nicht durch sie hindurch. Ablauf: rise → rose → burn → spores (goldene Sporen) → emerge →
  beast → dying (löst sich in Sporen auf) → Sieg. Ein festes Punktlicht für das Glühen.
- `js/water.js` – Bucht und Flüsse mit eigenem Shader (das flache Wasser sah dem Nutzer furchtbar aus): laufende
  Wellenschichten, Fresnel-Spiegelung des Nachthimmels, Mondglitzern (mit glatterer Normale), gespiegelte Hafenlichter
  in Ufernähe, Schaum an der Uferlinie, Regenringe, Wellenringe (`splash`, 16 Stück) und Schaumringe um Monster im
  Wasser (`setWaders`, max. 4); Kaimauern entlang der Ufer. `depth(x, z)`: Bucht fällt vom Ufer flach ab (bis 20 m),
  Flüsse bis 9 m. Godzilla taucht ein (bis 17 m, `g.waterDepth`, watet bis 25 % langsamer), Schritte im Wasser
  spritzen statt Bodenschäden, beim Waten Bugwellen und Gischt (`updateWaders` in main.js), der Strahl im Wasser dampft.
- `js/props.js` – Leben in der Stadt (sie wirkte steril): Straßenlaternen mit warmen Lichtkegeln auf dem Asphalt,
  Bäume in Parks und an Straßen der Wohn-/Büroviertel, geparkte Autos und ~100 fahrende Autos mit Scheinwerferkegel,
  die vor Godzilla fliehen und zertreten werden. Alles InstancedMesh, Menge je Qualitätsstufe (`props`: low 0,45,
  mid 1, high 1,4); Schritte, Angriffe und Einstürze werfen Requisiten im Umkreis um (`knock`). Gebäude sind je
  Instanz leicht unterschiedlich getönt (`setColorAt` in city.js).
- `js/atmosphere.js` – Nachtstimmung: Regen (LineSegments in einem Kasten um den Blickpunkt), 2 Flak-Suchscheinwerfer
  (additive Kegel auf Kreuzungen um Godzilla, tasten ihn langsam ab – 5 schnelle waren dem Nutzer zu viel), feste Anzahl Punktlichter an den nächsten Bränden
  (Anzahl je Qualitätsstufe, nie wechselnd – sonst übersetzt Three.js die Shader neu). Filmkorn per CSS (`#grain`).
- `js/audio.js` – Audio aus Teil 1 als ES-Modul (`Sound`: Orchester-Synth, Schrei als gestrichene Saite, Effekte) plus
  eigene Heisei-Stücke (`heisei` Titel, `tokyo` / `superx` für 1984, `osaka` / `superx2` / `biollante` für 1989, `sapporo` / `ghidorah` / `mecha` für 1991, `yokohama` / `battra` / `mothra` für 1992, `makuhari` / `rodan` / `gforce` für 1993, `fukuoka` / `moguera` / `spaceg` für 1994, `ariake` / `destoroyah` / `burning` für 1995, `requiem` für Godzillas Tod). `Music` spielt pro
  Platz (title, level, boss, final, over, win, end; level/boss stellt `Music.setLevel()` je Level um) zuerst eine eigene Datei aus `music/` (Namen in music/README.md; die 404-Meldungen beim
  Suchen sind gewollt), sonst das Synth-Stück. Ton startet mit der ersten Taste (Browser-Regel), M schaltet stumm.
  Ereignis → Geräusch in `hookSounds()` (main.js), häufige Ereignisse gedrosselt.
  Godzillas Schrei: liegen `music/roar1`, `roar2` (bis `roar3`; ogg/mp3/m4a/wav), spielt das Spiel diese eigenen
  Aufnahmen abwechselnd statt des Synth-Schreis (`loadRoarFiles`). roar1/roar2 sind aus den Nutzerdateien G1/G2.m4a
  geschnitten (Blenders `aud`-Modul kann m4a lesen und ogg schreiben, kein ffmpeg nötig): G1 1,0–4,4 s, G2 0,95–6,0 s,
  auf Spitze 0,95 angehoben, 40 ms ein- und am Ende ausgeblendet.
  King Ghidorah: `music/kg1` … `kg6` (Stimme `voice: 'kg'`), der Reihe nach; Mecha-King Ghidorah: `mkg1` … `mkg4`
  (aus MKG.m4a, drei Schreie; fehlen sie, King Ghidorahs Schreie mit Tonhöhe 0,85, `Sound.hasVoice`);
  Biollante: `bio1` … `bio6` (aus Bio.m4a: drei kräftige Schreie bio1–3, zwei leise bio4–5; Rose Tonhöhe 1,08,
  Bestie 0,92) beim Erscheinen, Fesseln, Biss, Saftspucken, Verbrennen und Ende. Feste Reihenfolge nach Dateinummer;
  kg1–kg5 aus KG.m4a (fünf Schreie in einer Tonspur, Schnitte in music/README.md). Er schreit beim Auftauchen, beim
  Landen, bei der Dreifach-Salve, bei schweren Treffern und beim Absturz (`ghidorahArrive/Land/Hurt`, gedrosselt 2,5 s).
- `js/minimap.js` – Mini-Map oben rechts (Gebäude, Flüsse, Parks, Zerstörung, Godzilla als Pfeil, Militär, Boss).
- `js/levels.js` – Level je Film: Stadtplan (`layout`), Start, Boss, Musik (Datei + Synth), Texte. Auswahl per
  `?level=1989` oder im Titelbild mit 1/2 (lädt neu, andere Parameter bleiben). **1984 Tokio** (Shinjuku, Super-X),
  **1989 Osaka** (Umeda-Hochhäuser nördlich des Flusses, Fluss quer in Reihe j = 1, südlich Dōtonbori als Zone `neon`,
  Burgpark im Osten, Hafen; Boss Super-X2, danach Endgegner Biollante über `final`/`finalGoal`), **1991 Sapporo**
  (Hochhäuser am Bahnhof im Norden, Ōdōri-Park als Blockreihe quer durch die Stadt, Susukino als `neon`, Hafen;
  King Ghidorah, danach Mecha-King Ghidorah), **1992 Yokohama** (Minato Mirai mit Landmark Tower am Wasser, Riesenrad
  am Hafen, Chinatown als `neon`, Yamashita-Park; Battra, danach Mothra; Wahrzeichen über `layout.specials`
  {type, i, j}, die einen Block belegen), **1993 Makuhari** (Bürotürme, drei Messehallen am Wasser, Strandpark;
  Rodan/Fire Rodan, danach Mechagodzilla), **1994 Fukuoka** (Tenjin-Hochhäuser, Fukuoka Tower am Wasser,
  Ōhori-Park, Hafen; Moguera, danach SpaceGodzilla), **1995 Tokio – Finale** (Big Sight in Ariake am Wasser,
  Hamarikyū-Garten; Destoroyah-Jungtiere/Flugform, danach Destoroyah). `burning: true` macht Godzilla zum Burning
  Godzilla (`setBurning()` in godzilla.js: glühende Lava-Flecken per Shader auf `GZ_Body` wie im Film großflächig auf
  Brust und Bauch, Oberschenkeln und Schultern (Bereiche nach Bind-Pose-Position, Rand dunkelrot, Mitte orange),
  rot-orange Platten und Strahl,
  `power` 1,25). Nach dem Sieg folgt die Kernschmelze (`meltdown()`: Glut wächst, Dampf, Explosion, Musikplatz `end`,
  Endbildschirm „Das Ende der Heisei-Ära“). Endgegner-Ereignisse allgemein: `finalRise`/`finalDown` (mit `title`),
  `finalGone`.
- `js/effects.js` – Strahl und Schockwelle als additive Shader, keine Postprocessing-Passes (eine aufwendigere Strahl-
  Optik mit Spiralen, Pulsen und Funken gefiel dem Nutzer nicht und wurde zurückgebaut). `Lightning`: Ghidorahs Blitze
  (schlankes Band, zwei Nebenarme – dicker gefiel nicht; „zu schwach“ meinte den Schaden); `Particles` (ein
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
Level „Tokio 1984 – Die Rückkehr“, „Osaka 1989“ (Super-X2, dann Biollante in zwei Stufen) und „Sapporo 1991“
(King Ghidorah, dann Mecha-King Ghidorah), „Yokohama 1992“ (Battra als Larve und Falter, dann Mothra), „Makuhari 1993“
(Rodan, dann Mechagodzilla), „Fukuoka 1994“ (Moguera, dann SpaceGodzilla) und das Finale „Tokio 1995“ (Destoroyah,
Burning Godzilla, Kernschmelze) spielbar – alle sieben Heisei-Level sind angelegt. Die Schritte stammen vom ersten PC:
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
Außerdem offen: echte GPU-Last auf der UHD 615 prüfen (~370k Dreiecke mit Requisiten, ~70 Draw Calls; `?q=low`), Lautstärken
anhören, Balance (Wellen, Schaden, Bossphase) im echten Spiel prüfen, Biollante-Kampf im echten Spiel abstimmen,
Kämpfe im echten Spiel abstimmen, alle Monster nach den Bildvorlagen und Soundeffekten des Nutzers verfeinern
(Mothra, Battra, Rodan, Mechagodzilla, SpaceGodzilla, Destoroyah und Burning Godzilla sind nach den Bildern des
Nutzers überarbeitet; Moguera ist noch ein Entwurf ohne Bildvorlage).
