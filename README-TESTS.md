# Tests

Alle Suiten laufen ohne Foundry, mit `node`:

```
for f in tools/test-*.mjs; do node "$f"; done
```

Zwei Suiten brauchen zwei Pakete. Ohne sie ueberspringen sie sich, statt
fehlzuschlagen:

```
npm install --no-save handlebars jsdom
```

| Suite | prueft |
| --- | --- |
| `test-load.mjs` | jede Datei aus `scripts/` laedt mit einer Foundry-Attrappe. Faengt Syntaxfehler, die sonst das ganze Modul stillschweigend abschalten. |
| `test-templates.mjs` | die Handlebars-Templates uebersetzen und rendern, und die erwarteten Textstellen stehen im Ergebnis. |
| `test-roundtrip.mjs` | rendern, Formular auslesen, speichern, neu rendern: abgeleitete Werte folgen einer Aenderung, und beim Speichern geht nichts verloren. |
| `test-rules`-Teile in `test-area.mjs` | Flaechen, Skill-Boni, Zielzahl, Abwehr-Skill. |
| `test-damage.mjs` | Ruestung, Verschleiss, Resistenz, Schadenswurf, Pools. |
| `test-resistance.mjs` | Schadensreduktion, Stilllegung, Gift, und die ganze Kette aus der echten `data/skill-baum.json`. |
| `test-skill-graph.mjs` | Baumaufbau, Voraussetzungen, eigene Skills, Uebergabe in den Bogen. |
| `test-wiring.mjs` | jeder Listener findet sein Element, und jedes Feld, das gespeichert werden muss, steht im Formular. |

## Skill-Baum als eigenstaendige Datei

```bash
node tools/build-tree-html.mjs
```

Schreibt `ttrpg-lbds-skill-tree.html`: eine Datei ohne Netz und ohne Foundry,
mit allen Skills, den Regeln und einer Suche. Sie ist nicht im Repository (wie
das PDF), weil sie den vollen Regeltext enthaelt.

**Nach jeder Aenderung an `data/skill-baum.json`, an `scripts/skill-graph.js`
oder an den Formeln in `scripts/rules.js` neu erzeugen.**

Die eigenen Skills einer Welt stehen in Foundry, nicht im Projekt. Dafuer gibt
es im Skill-Baum-Fenster den Knopf **Als HTML speichern**: derselbe Generator,
aber mit den eigenen Skills der Welt.
