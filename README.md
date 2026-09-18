# Mein ISEKAI Charakterbogen

Eigener Foundry-VTT-Charakterbogen fuer das TTRPG-LBDS-Hausregelsystem (Actor-Sheet fuer das System `pf1`).

## Installation

In Foundry unter **Konfiguration -> Add-on Module -> Modul installieren** diese Manifest-URL eintragen:

```
https://github.com/hm-delta-six/isekai-bogen/releases/latest/download/module.json
```

Danach meldet Foundry neue Versionen selbst, ein Klick auf **Update** genuegt.

## Funktionen

- Abgeleitete Werte (HP/MP/AP, AW, VW, Initiative, Skill-Caps, Waffenschaden) aus Rasse, Klasse, Raritaet und Titel-Boni
- Waffenangriff nach Wiki-Regel: Erfolgschance = 50 x (AW / VW), W100 unter der Chance trifft
- Skill-Proben additiv: `1d100 + Skill-Level + Attribut (inkl. Titel-Boni) + Modifikator`
- Vergleichende Proben gegen beliebig viele markierte Tokens
- Verdeckte Wuerfe fuer den Spielleiter

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

## Release bauen

```
git tag v1.2.0
git push origin v1.2.0
```

Der Workflow in `.github/workflows/release.yml` setzt die Version aus dem Tag,
packt `module.json`, `scripts/` und `templates/` und haengt beides ans Release.
