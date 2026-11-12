// Fuegt einen Vorschlag in einen Skill-Baum ein und prueft ihn dabei.
//
//   node tools/merge-skills.mjs <baum.json> <vorschlag.json> [ziel.json]
//
// Geprueft wird dasselbe wie bei jedem eigenen Skill, dazu zwei Regeln:
// jede Ebene ist tiefster Elternskill + 1, und ein Zauber sitzt nie unter der
// Raritaet, die sein Grad verlangt.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTree, makeCustomSkill, validateCustom, LEVEL_FLOOR } from "../scripts/skill-graph.js";
import { typeList } from "../scripts/rules.js";

const root = join(import.meta.dirname, "..");
const [quelle, vorschlag, zielDatei] = process.argv.slice(2);
if (!quelle || !vorschlag) {
  console.error("node tools/merge-skills.mjs <baum.json> <vorschlag.json> [ziel.json]");
  process.exit(1);
}
const ziel = zielDatei || quelle;

// Mindest-Raritaetsstufe nach Zaubergrad
const GRAD_MINDEST = (grad) => grad <= 2 ? 1 : grad <= 4 ? 2 : grad <= 6 ? 3 : grad <= 8 ? 4 : 5;

const base = JSON.parse(readFileSync(join(root, quelle), "utf8"));
const neu = JSON.parse(readFileSync(join(root, vorschlag), "utf8")).skills;

const vorhandeneNamen = new Set(Object.values(base.skills).map(s => s.name.toLowerCase()));
const fehler = [];

// Schrittweise aufbauen, damit ein Vorschlag auf den vorigen bauen darf
let tree = buildTree(base, []);
const customs = [];
for (const eintrag of neu) {
  const pruefung = validateCustom(tree, { ...eintrag, ms: eintrag.ms || "" }, null);
  if (pruefung.errors?.length) fehler.push(`${eintrag.name}: ${pruefung.errors.join(" | ")}`);
  if (vorhandeneNamen.has(String(eintrag.name).toLowerCase())) {
    fehler.push(`${eintrag.name}: Name gibt es schon`);
  }
  customs.push(makeCustomSkill({ ...eintrag, ms: eintrag.ms || "" }, eintrag.id));
  tree = buildTree(base, customs);
}

const voll = buildTree(base, customs);
for (const eintrag of neu) {
  const im = voll.skills[eintrag.id];
  if (!im) { fehler.push(`${eintrag.name}: nicht im Baum`); continue; }

  const tiefste = Math.max(0, ...im.parents.map(p => voll.skills[p].level));
  if (im.level !== tiefste + 1) fehler.push(`${eintrag.name}: Ebene ${im.level}, Eltern bis ${tiefste}`);
  const weg = (eintrag.parents || []).filter(p => !im.parents.includes(p));
  if (weg.length) fehler.push(`${eintrag.name}: unbekannte Eltern ${weg.join(", ")}`);
  const verloren = (eintrag.types || []).filter(t => !typeList(eintrag.types).includes(t));
  if (verloren.length) fehler.push(`${eintrag.name}: Schadensart unbekannt: ${verloren.join(", ")}`);

  if (eintrag.grad !== undefined) {
    const noetig = GRAD_MINDEST(eintrag.grad);
    const hat = LEVEL_FLOOR[im.level];
    if (hat < noetig) {
      fehler.push(`${eintrag.name}: Grad ${eintrag.grad} braucht Stufe ${noetig}, Ebene ${im.level} gibt ${hat}`);
    }
  }
}

if (fehler.length) {
  console.error(`${fehler.length} Fehler:\n  ` + fehler.join("\n  "));
  process.exit(1);
}

// Eintragen. arch, fl und floor fuehrt die Datei mit, buildTree errechnet sie.
const ausgabe = JSON.parse(JSON.stringify(base));
for (const fertig of customs) {
  const gebaut = voll.skills[fertig.id];
  ausgabe.skills[fertig.id] = {
    id: fertig.id, name: fertig.name, domain: fertig.domain, parents: fertig.parents,
    attr: fertig.attr, type: fertig.type, res: fertig.res, level: fertig.level,
    kern: fertig.kern, ms: fertig.ms, types: fertig.types, replaces: fertig.replaces,
    cond: fertig.cond, cat: fertig.cat, bm: fertig.bm, boosts: fertig.boosts,
    arch: gebaut.arch, fl: gebaut.fl, floor: gebaut.floor
  };
  ausgabe.order.push(fertig.id);
}

writeFileSync(join(root, ziel), JSON.stringify(ausgabe), "utf8");
console.log(`${ziel}: ${base.order.length} + ${customs.length} = ${ausgabe.order.length} Skills`);
