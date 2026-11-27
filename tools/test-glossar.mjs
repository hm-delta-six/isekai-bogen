// Jede Abkuerzung, die eine Skill-Beschreibung verwendet, muss im Glossar
// stehen — und keine Beschreibung darf mit einem Buchstaben rechnen, der
// nirgends erklaert ist ("W x 5" war genau dieser Fall).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GLOSSARY, glossaryLines } from "../scripts/rules.js";
import { buildTree } from "../scripts/skill-graph.js";
import { treeHtml } from "../scripts/tree-export.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(join(root, "data/skill-baum.json"), "utf8"));
const template = readFileSync(join(root, "templates/skill-tree.html"), "utf8");

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

const begriffe = GLOSSARY.flatMap(block => block.begriffe);
const kurz = begriffe.map(eintrag => eintrag.kurz);

check("jeder Begriff kommt nur einmal vor", kurz.length, new Set(kurz).size);
check("jeder Begriff hat eine Erklaerung", begriffe.filter(eintrag => !eintrag.text?.trim()), []);

// Was im Bogen vorkommt, muss erklaert sein.
const pflicht = ["HP", "AP", "MP", "AW", "VW", "DR", "INI", "Stufe", "Raritätsstufe",
  "Machtfaktor", "Kästchen", "Runde", "Ebene", "S", "R", "M"];
check("alle Pflichtbegriffe stehen im Glossar", pflicht.filter(begriff => !kurz.includes(begriff)), []);

const tree = buildTree(base);
const texte = tree.order.flatMap(id => {
  const skill = tree.skills[id];
  const zeilen = [[skill.name, skill.kern]];
  for (const [brief, stufe] of Object.entries(skill.werte?.st || {})) {
    zeilen.push([`${skill.name}/${brief}`, stufe.w], [`${skill.name}/${brief} Kosten`, stufe.k]);
  }
  if (skill.werte?.rw) zeilen.push([`${skill.name} Reichweite`, skill.werte.rw]);
  return zeilen;
});

// Ein einzelner Buchstabe vor einem Malzeichen ist eine Rechnung mit einer
// Groesse, die niemand kennt. Zahlen davor sind in Ordnung ("3x Stufe").
const unerklaert = texte
  .filter(([, text]) => /(^|[^\wÄÖÜäöüß])[A-Za-z]\s*(?:[×*]|\sx\s)/.test(String(text)) ||
    /(^|[^\wÄÖÜäöüß])W(?![\wÄÖÜäöüß6])/.test(String(text)))
  .map(([wo]) => wo);
check("keine Rechnung mit einem unerklaerten Buchstaben", unerklaert, []);

// Begriffe aus der Zeit vor dem Glossar: der Bogen nennt die Zahl eines
// Skills "Bonus", seine Hoehe "Stufe".
const alteBegriffe = texte
  .filter(([, text]) => /Wirkungswert|Level/.test(String(text)))
  .map(([wo]) => wo);
check("keine Beschreibung sagt Wirkungswert oder Level", alteBegriffe, []);

// Der Bogen nennt die Lebenspunkte HP. "LP" gibt es nirgends.
const lp = texte.filter(([, text]) => /\bLP\b/.test(String(text))).map(([wo]) => wo);
check("keine Beschreibung sagt LP", lp, []);

// Die Begriffe, die das Glossar als Kurzform fuehrt, muessen auch so
// geschrieben werden: "Skill-Level" heisst in einer Wirkung "Stufe".
const wortwahl = texte
  .filter(([, text]) => /\bSkill-Level\b/.test(String(text)))
  .map(([wo]) => wo);
check("eine Wirkung sagt Stufe, nicht Skill-Level", wortwahl, []);

// --- Anzeige ---
check("das Fenster zeigt das Glossar", template.includes('class="st-gloss"'), true);
check("das Fenster hat einen Weg dorthin", template.includes('class="st-glossar"'), true);

const seite = treeHtml(base, [], { template, stand: new Date("2026-01-01") });
check("die Datei zeigt das Glossar", seite.includes("st-gloss"), true);
check("die Datei erklaert die Stufe", seite.includes("Das Level genau dieses Skills"), true);
check("jede Gruppe steht in der Datei",
  glossaryLines().filter(block => !seite.includes(block.gruppe)), []);

console.log(fails ? `\n${fails} Fehler` : "\nalles gruen");
process.exit(fails ? 1 : 0);
