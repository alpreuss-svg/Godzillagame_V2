# Eigene Musik (bleibt lokal)

Lege hier deine eigenen, legal erworbenen Soundtrack-Dateien ab. Der Ordner wird nicht auf GitHub hochgeladen.
Fehlt eine Datei, spielt das Spiel ein selbst komponiertes Ersatzstück (Synth).

Dateinamen (Endung .mp3, .ogg oder .m4a):

| Datei        | Wann                         | Vorschlag                               |
|--------------|------------------------------|-----------------------------------------|
| `title`      | Titelbild                    | Main Title                              |
| `1984`       | Tokio 1984, Spiel            | Godzilla-Thema / Stadtzerstörung        |
| `1984_boss`  | Bossphase Super-X            | Super-X-Marsch (Koroku)                 |
| `1989`       | Osaka 1989, Spiel            | „Bio Wars“ (Sugiyama)                   |
| `1989_boss`  | Bossphase Super-X2           | Super-X2-Marsch (Sugiyama)              |
| `1989_final` | Endkampf Biollante           | Biollante-Thema (Sugiyama)              |
| `1991`       | Sapporo 1991, Spiel          | Main Title (Ifukube)                    |
| `1991_boss`  | Bossphase King Ghidorah      | King-Ghidorah-Thema (Ifukube)           |
| `1991_final` | Endkampf Mecha-King Ghidorah | Mecha-King-Ghidorah-Thema (Ifukube)     |
| `1992`       | Yokohama 1992, Spiel         | Main Title (Ifukube)                    |
| `1992_boss`  | Bossphase Battra             | Battra-Thema (Ifukube)                  |
| `1992_final` | Endkampf Mothra              | Mothras Lied (Koseki/Ifukube)           |
| `gameover`   | Godzilla fällt               | ein ruhiges, trauriges Stück            |
| `win`        | Sieg                         | Abspann                                 |

Beispiel: `music/1984_boss.mp3`

Godzillas Schrei: `roar1`, `roar2` (bis `roar3`) – eigene Aufnahmen, abwechselnd abgespielt; fehlen sie, schreit der
Synthesizer. Zurechtgeschnitten aus G1/G2 mit Blenders Audio-Bibliothek (siehe CLAUDE.md): Stille vorn weg, Knackser
hinten weg, auf volle Lautstärke angehoben, kurz ein- und ausgeblendet.

King Ghidorahs Schrei: `kg1` … `kg6` – eigene Aufnahmen, der Reihe nach (Mecha-King Ghidorah etwas tiefer). kg1–kg5
sind aus KG.m4a geschnitten (fünf Schreie in einer Tonspur: 0,1–2,9 s, 3,2–5,9 s, 6,15–8,4 s, 9,2–13,3 s, 14,4–18,1 s).

Mecha-King Ghidorahs Schrei: `mkg1` … `mkg4` (fehlen sie, nimmt er King Ghidorahs Schreie etwas tiefer). mkg1–mkg3
sind aus MKG.m4a geschnitten (drei Schreie: 2,15–4,7 s, 6,85–9,3 s, 12,15–14,2 s).

Biollantes Schrei: `bio1` … `bio6` (Rose etwas heller, Bestie tiefer). Aus Bio.m4a geschnitten: bio1 0,0–2,0 s,
bio2 11,65–15,5 s, bio3 17,75–19,45 s (die drei kräftigen), bio4 3,3–4,45 s und bio5 7,75–9,35 s (zwei leise).

Battra: `batt1` … `batt4`, Mothra: `moth1` … `moth4` (eigene Schreie, optional; sonst Synth-Kreischen).
