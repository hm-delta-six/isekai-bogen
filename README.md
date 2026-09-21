# Mein ISEKAI Charakterbogen

Eigener Foundry-VTT-Charakterbogen fuer das TTRPG-LBDS-Hausregelsystem (Actor-Sheet fuer das System `pf1`).

## Installation

In Foundry unter **Konfiguration -> Add-on Module -> Modul installieren** diese Manifest-URL eintragen:

```
https://github.com/hm-delta-six/isekai-bogen/releases/latest/download/module.json
```

Danach meldet Foundry neue Versionen selbst, ein Klick auf **Update** genuegt.

## Token-Balken

Die drei Pools liegen unter diesen Pfaden und sind in der Token-Konfiguration
bzw. in Bar Brawl als Attribut einzutragen:

```
resources.hp
resources.mp
resources.ap
```

Nicht `attributes.hp` verwenden. Dieses Feld gehoert dem pf1-System, das sein
max bei jeder Datenvorbereitung aus Klassen-Trefferwuerfeln neu berechnet und
ohne pf1-Klassen auf 0 setzt. Ein Balken darauf zeigt 45/0 und bleibt leer.

Damit die Felder ueberhaupt existieren, muss der Bogen eines Charakters einmal
geoeffnet worden sein.

Die drei Pfade stehen sowohl in der Token-Konfiguration eines Akteurs als auch
in der Standard-Token-Konfiguration zur Auswahl. Letztere kennt keinen Akteur
und leitet ihre Liste sonst aus dem pf1-Datenmodell ab, in dem die Felder nicht
vorkommen; scripts/token-bars.js erweitert deshalb die Ermittlung selbst.

## Funktionen

- Abgeleitete Werte (HP/MP/AP, AW, VW, Initiative, Skill-Caps, Waffenschaden) aus Rasse, Klasse, Raritaet und Titel-Boni
- Waffenangriff nach Wiki-Regel: Erfolgschance = 50 x (AW / VW), W100 unter der Chance trifft
- Skill-Proben additiv: `1d100 + Skill-Level + Attribut (inkl. Titel-Boni) + Modifikator`
- Vergleichende Proben gegen beliebig viele markierte Tokens
- Verdeckte Wuerfe fuer den Spielleiter

## Waffen und Skills

Jede Waffe verweist in der Spalte **Skill** auf einen Skill aus der Skill-Liste
des Charakters. Von dort kommen beide Werte, die der Angriffswert braucht:

```
AW = 10 + AW-Skill + Skill-Level der Waffe + steuerndes Attribut des Skills
     + allgemeine Boni + Waffenbonus
```

Jede Waffe traegt ausserdem eine Mehrfachauswahl der Schadensarten
(Hieb, Stich, Wucht, Feuer, Saeure, Elektrizitaet, Schall, Kaelte, Energie).

Derselbe Skill zaehlt auch auf den Schaden:

```
Schaden = Wuerfel x Machtfaktor + Attribut des Skills + halber AW-Skill
          + Skill-Level der Waffe + Waffenbonus
```

Angriffswert und Schaden nutzen dasselbe Attribut: das des verknuepften Skills.
Ein Bogen auf einem DEX-Skill rechnet also auch den Schaden mit DEX. Ohne
Verknuepfung ist es STR.

Das Level wird nicht an der Waffe gepflegt. Steigt der Skill in der Skill-Liste,
steigt der Angriffswert sofort mit. Ohne Verknuepfung zaehlt der Skill als 0 und
das Attribut ist STR.

## Ruestung, Resistenzen und Schadensarten

Eine Ruestung hat DR, Haltbarkeit und eine Mehrfachauswahl der Schadensarten,
gegen die ihre DR ueberhaupt zaehlt. Gegen jede nicht gewaehlte Art ist ihre DR
null. Ein Eintrag ohne Auswahl schuetzt gegen alles, damit alte Eintraege
gueltig bleiben.

Resistenzen stehen in einer eigenen Tabelle und rechnen nach Kapitel 9.3:

```
Reduktion = Skill-Level x Raritaetsstufe
```

gedeckelt auf einen Anteil des eingehenden Schadens, der vom Stufenabstand
zum Angriff abhaengt: 2+ Stufen hoeher 100 %, 1 hoeher 75 %, gleich 50 %,
1 niedriger 25 %, 2+ niedriger 0 %. Das Level kommt aus dem verknuepften Skill.
Deckt eine Resistenz mehrere Arten ab, gilt sie als allgemein und rechnet mit
Skill-Level x (Raritaetsstufe - 1), mindestens Skill-Level / 2.

Reihenfolge eines Treffers: **Ruestung, dann Resistenz.** Die Haltbarkeit nimmt
Schaden in Hoehe dessen, was die Ruestung nicht aufhalten konnte, also vor der
Resistenz. Bei mehreren Schadensarten einer Waffe gilt der beste Durchgriff:
es zaehlt die Art, bei der am Ende der meiste Schaden ankommt.

## Angriffsbereich

Jede Waffe hat ein Feld **Bereich** und dahinter ein Groessenfeld. Der Wuerfel
an der Waffe und `game.isekaiBogen.attack()` greifen danach an.

| Bereich | Groesse (1 Kaestchen = 5 Fuss / 1,5 m) |
|---|---|
| Einzelangriff | keine, Feld gesperrt |
| Markierte Gegner | hoechstens Skill-Level Ziele |
| Kegel | Raritaetsstufe x Skill-Level Kaestchen lang, 53 Grad |
| Kreis | Raritaetsstufe x Skill-Level / 2 Kaestchen Durchmesser |
| Linie | Raritaetsstufe x Skill-Level x 2 Kaestchen lang, 1 breit |

Raritaetsstufe und Skill-Level sind die der Waffe bzw. ihres verknuepften
Skills. Leeres Groessenfeld heisst volle Groesse; der Hoechstwert steht als
Platzhalter darin und waechst mit dem Skill. Wer die Flaeche kleiner eintraegt,
bekommt -1 AW pro Kaestchen. Weniger markierte Ziele kosten nichts.

- **Markierte Gegner:** Schaden auf alle markierten Tokens. Sind mehr markiert
  als erlaubt, wird der Angriff mit Hinweis verweigert.
- **Kegel, Kreis, Linie:** nach dem Dialog wird die Flaeche auf der Karte
  platziert (Klick setzt, Shift/Strg + Mausrad dreht, Rechtsklick bricht ab).
  Getroffen ist jeder Token, der mindestens zur Haelfte in der Flaeche steht,
  ausser dem Angreifer selbst.

Jedes Ziel bekommt einen eigenen Angriffswurf gegen seinen VW und bei einem
Treffer einen eigenen Schadenswurf. Gegner im selben Angriff koennen also
unterschiedlich getroffen werden.

## Vergleichende Proben

Ein Klick auf den Wuerfel neben einem Skill oeffnet den Probendialog.

| Markierte Tokens | Gegenstueck konfiguriert | Ergebnis |
|---|---|---|
| keine | egal | offener Wurf |
| eines oder mehrere | nein | offener Wurf |
| eines oder mehrere | ja | vergleichender Wurf gegen jedes Ziel |

Mehrere Ziele markieren: erstes mit `T`, weitere mit `Shift+T`.
Bei Gleichstand gewinnt das Ziel. Besitzt ein Ziel den Gegen-Skill nicht, wuerfelt es mit Skill-Level 0.

Die Paare stehen in **Konfiguration -> Moduleinstellungen -> Gegensaetzliche Skills**:

```
Heimlichkeit:DEX <-> Wahrnehmung:WIS
```

Ein Paar pro Zeile. Das Attribut hinter dem Doppelpunkt ist optional und greift nur,
wenn das Ziel den Skill nicht auf dem Bogen hat.

## Aus der Makroleiste

Ein Skript-Makro mit genau dieser Zeile:

```js
game.isekaiBogen.attack();
```

Es nimmt den ausgewaehlten Token, sonst den eigenen Charakter, und oeffnet
denselben Angriffsdialog wie der Wuerfel im Bogen: Waffenauswahl (zuletzt
benutzte Waffe vorausgewaehlt), Wurf-Modus Normal / Vorteil / Nachteil,
Trefferchance live berechnet. Schaden, DR und Haltbarkeit laufen durch
dieselbe Logik wie beim Angriff aus dem Bogen.

Weitere Einstiegspunkte:

```js
game.isekaiBogen.attackWith(actor, weapon);  // feste Waffe
game.isekaiBogen.rollSkillCheck(actor, 0);   // Skill nach Index
```

## Tests

```
node tools/test-damage.mjs
node tools/test-area.mjs
node tools/test-wiring.mjs
```

Der erste prueft die Rechenwege (Ruestung, Resistenzen, Waffen-Skill,
Token-Balken) und rechnet die Beispieltabelle aus Wiki-Kapitel 9.3 nach.
Der zweite prueft, dass jeder Klick-Listener im Bogen eine Klasse im Template
findet und umgekehrt.

## Release bauen

```
git tag v1.2.0
git push origin v1.2.0
```

Der Workflow in `.github/workflows/release.yml` setzt die Version aus dem Tag,
packt `module.json`, `scripts/` und `templates/` und haengt beides ans Release.
