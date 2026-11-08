// Baut die Variante des Skill-Baums: Grundbestand plus die Skills aus
// docs/vorschlag-moderne-skills.json.
//
//   node tools/build-modern-tree.mjs
//
// Schreibt data/skill-baum-modern.json. Der Grundbestand bleibt unberuehrt;
// im Spiel waehlt eine Welteinstellung, welcher der beiden geladen wird.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTree, makeCustomSkill } from "../scripts/skill-graph.js";

const root = join(import.meta.dirname, "..");
const base = JSON.parse(readFileSync(join(root, "data/skill-baum.json"), "utf8"));
const neu = JSON.parse(readFileSync(join(root, "docs/vorschlag-moderne-skills.json"), "utf8")).skills;

const ziel = JSON.parse(JSON.stringify(base));

for (const eintrag of neu) {
  const fertig = makeCustomSkill({ ...eintrag, ms: eintrag.ms || "" }, eintrag.id);
  // In den Baumdaten liegen die Skills ohne die Felder, die buildTree selbst
  // errechnet — bis auf arch, fl und floor, die dort mitgefuehrt werden.
  ziel.skills[eintrag.id] = {
    id: fertig.id,
    name: fertig.name,
    domain: fertig.domain,
    parents: fertig.parents,
    attr: fertig.attr,
    type: fertig.type,
    res: fertig.res,
    level: fertig.level,
    kern: fertig.kern,
    ms: fertig.ms,
    types: fertig.types,
    replaces: fertig.replaces,
    cond: fertig.cond,
    cat: fertig.cat,
    bm: fertig.bm,
    boosts: fertig.boosts,
    arch: null, fl: null, floor: null
  };
  ziel.order.push(eintrag.id);
}

// arch, fl und floor aus dem fertigen Baum zurueckschreiben
const gebaut = buildTree(ziel, []);
for (const eintrag of neu) {
  const s = gebaut.skills[eintrag.id];
  Object.assign(ziel.skills[eintrag.id], { arch: s.arch, fl: s.fl, floor: s.floor });
}

// Gegenprobe: laedt die Variante sauber?
const probe = buildTree(ziel, []);
const fehler = [];
for (const id of ziel.order) {
  const s = probe.skills[id];
  if (!s) { fehler.push(`${id}: fehlt`); continue; }
  const tiefste = Math.max(0, ...s.parents.map(p => probe.skills[p].level));
  if (s.level !== tiefste + 1) fehler.push(`${s.name}: Ebene ${s.level}, Eltern bis ${tiefste}`);
}
if (fehler.length) {
  console.error("FEHLER:\n  " + fehler.join("\n  "));
  process.exit(1);
}

const pfad = join(root, "data/skill-baum-modern.json");
writeFileSync(pfad, JSON.stringify(ziel), "utf8");
console.log(`${pfad}`);
console.log(`${base.order.length} + ${neu.length} = ${ziel.order.length} Skills`);
