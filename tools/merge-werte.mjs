// Traegt konkrete Werte je Raritaet in die Baumdaten ein.
//
//   node tools/merge-werte.mjs docs/werte-kombi.json [data/skill-baum.json]
//
// Die Quelle ist eine Datei { "<skill-id>": { reichweite, stufen: {
// "U": { wirkung, kosten }, ... } } }. Pro Skill entsteht daraus das Feld
// `werte` ({ rw, st }). Geprueft wird, dass jede Raritaet ab der
// Einstiegsraritaet des Skills eine Wirkung und eine Kostenangabe hat und
// dass keine Platzhalter stehenbleiben.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const quelle = process.argv[2];
const ziel = process.argv[3] || "data/skill-baum.json";
if (!quelle) {
  console.error("Aufruf: node tools/merge-werte.mjs <werte.json> [ziel.json]");
  process.exit(2);
}

const BUCHSTABEN = ["C", "U", "R", "E", "L", "T"];
const base = JSON.parse(readFileSync(join(root, ziel), "utf8"));
const werte = JSON.parse(readFileSync(join(root, quelle), "utf8"));

const fehler = [];
const ausgabe = JSON.parse(JSON.stringify(base));

for (const [id, eintrag] of Object.entries(werte)) {
  const skill = ausgabe.skills[id];
  if (!skill) { fehler.push(`${id}: kein Skill mit dieser Id`); continue; }

  const rw = String(eintrag.reichweite || "").trim();
  if (!rw) fehler.push(`${id}: keine Reichweite`);

  // Die Zeilen zaehlen zusammen: eine hoehere Raritaet schreibt nur, was sich
  // aendert. Wiederholt sie den ersten Satz der Zeile darueber wortgleich,
  // ist das die alte, redundante Form.
  const ersterSatz = (text) => String(text).split(/(?<=\.)\s+/)[0].trim();
  let vorher = "";

  const st = {};
  for (let rang = skill.fl; rang <= 6; rang++) {
    const brief = BUCHSTABEN[rang - 1];
    const stufe = eintrag.stufen?.[brief];
    if (!stufe) { fehler.push(`${id}/${brief}: Raritaet fehlt`); continue; }
    const wirkung = String(stufe.wirkung || "").trim();
    const kosten = String(stufe.kosten || "").trim();
    if (!wirkung) fehler.push(`${id}/${brief}: keine Wirkung`);
    if (!kosten) fehler.push(`${id}/${brief}: keine Kosten`);
    // Die Raritaet ist schon eingerechnet: ihr Name darf nicht als Rechen-
    // anweisung im Text stehenbleiben.
    if (/Rarität|Raritätsstufe|Machtfaktor|<|TODO/i.test(wirkung)) {
      fehler.push(`${id}/${brief}: Platzhalter im Text — "${wirkung}"`);
    }
    if (!/\d/.test(wirkung)) fehler.push(`${id}/${brief}: keine Zahl in der Wirkung`);
    if (vorher && ersterSatz(wirkung) === vorher) {
      fehler.push(`${id}/${brief}: wiederholt die Zeile darunter — nur schreiben, was sich ändert`);
    }
    vorher = ersterSatz(wirkung);
    st[brief] = { w: wirkung, k: kosten };
  }

  for (const brief of Object.keys(eintrag.stufen || {})) {
    if (!BUCHSTABEN.includes(brief)) fehler.push(`${id}/${brief}: unbekannte Raritaet`);
    else if (BUCHSTABEN.indexOf(brief) + 1 < skill.fl) {
      fehler.push(`${id}/${brief}: liegt unter der Einstiegsraritaet (${skill.floor})`);
    }
  }

  skill.werte = { rw, st };
}

if (fehler.length) {
  console.error(`${fehler.length} Fehler:`);
  for (const zeile of fehler) console.error(`  ${zeile}`);
  process.exit(1);
}

writeFileSync(join(root, ziel), JSON.stringify(ausgabe), "utf8");
const mit = Object.values(ausgabe.skills).filter(skill => skill.werte).length;
console.log(`${Object.keys(werte).length} Skills eingetragen, ${mit} von ${ausgabe.order.length} haben jetzt Werte.`);
