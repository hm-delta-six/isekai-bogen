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

## Der Skill-Baum und seine Vorschlagsdateien

Es gibt **einen** Baum: `data/skill-baum.json`. Er entsteht nicht aus
Handarbeit, sondern aus Vorschlagsdateien, die eingefuegt werden:

```bash
node tools/merge-skills.mjs data/skill-baum.json docs/vorschlag-zauber.json
node tools/merge-skills.mjs data/skill-baum.json docs/vorschlag-moderne-skills.json
```

`merge-skills.mjs` prueft dabei dasselbe wie bei jedem eigenen Skill, dazu
zwei Regeln: jede Ebene ist tiefster Elternskill + 1, und ein Zauber sitzt nie
unter der Raritaet, die sein Grad verlangt (Grad 0-2 ab Common, 3-4 ab
Uncommon, 5-6 ab Rare, 7-8 ab Epic, 9 ab Legendary). Ein Lauf ist nicht
wiederholbar: er fuegt ein, was noch nicht da ist, und bricht bei einem
doppelten Namen ab.

Die HTML-Datei dazu:

```bash
node tools/build-tree-html.mjs
```

Mit `--fragment` entsteht eine Fassung ohne eigenes Dokumentgeruest, wie sie
eine Artifact-Seite braucht; dort kommt der Rahmen von der Plattform:

```bash
node tools/build-tree-html.mjs data/skill-baum.json skill-baum-artifact.html --fragment
```

## Aenderungen an mitgelieferten Skills

Der Spielleiter kann jeden Skill bearbeiten, nicht nur eigene. Eine Aenderung
an einem mitgelieferten Skill wird **nicht** in `data/` geschrieben, sondern
als Ueberschreibung in der Welt gespeichert (dieselbe Einstellung wie eigene
Skills, erkennbar an der Id des Originals). `buildTree` legt sie beim Laden
ueber den Grundbestand.

Darum darf `data/skill-baum.json` jederzeit aktualisiert werden: was der
Spielleiter geaendert hat, bleibt. `tools/test-skill-graph.mjs` prueft genau
das.
