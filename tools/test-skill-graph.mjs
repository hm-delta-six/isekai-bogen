import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ancestors, buildTree, descendants, effectLines, formatMilestones, LEVEL_FLOOR, LEVEL_REQ,
  makeCustomSkill, milestoneTemplate, parseMilestones, sheetCategory, sheetEntry, shortEffect,
  unlockStatus, validateCustom
} from "../scripts/skill-graph.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(join(root, "data/skill-baum.json"), "utf8"));

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

const tree = buildTree(base);
const S = tree.skills;

// --- Datenbestand ---
// Keine feste Zahl: der Bestand waechst. Geprueft wird, dass der Baum
// genau die Skills der Datei enthaelt.
check("Baum enthaelt alle Skills der Datei", tree.order.length, Object.keys(base.skills).length);
check("Reihenfolge ohne Dubletten", new Set(tree.order).size, tree.order.length);
check("Ebene 5 hat mindestens 5 Skills", tree.order.filter(id => S[id].level === 5).length >= 5, true);

let broken = [];
for (const id of tree.order) {
  const s = S[id];
  const deepest = Math.max(0, ...s.parents.map(p => S[p].level));
  if (s.level !== deepest + 1) broken.push(`${id}: Ebene ${s.level} statt ${deepest + 1}`);
  if (s.fl !== LEVEL_FLOOR[s.level]) broken.push(`${id}: Einstiegsrarität`);
  if (s.floor !== tree.rn[s.fl - 1]) broken.push(`${id}: floor-Text`);
  if (effectLines(tree, id).length !== 7 - s.fl) broken.push(`${id}: Zeilenzahl`);
}
check("jede Ebene = 1 + tiefster Elternskill, Rarität passt", broken, []);

// --- Axt-Umbau ---
check("Axt & Beil liegt auf Ebene 2", S.waf_axt.level, 2);
check("Axt & Beil hängt an Nahkampf", S.waf_axt.parents, ["waf_nah"]);
check("Axtkampf liegt auf Ebene 3", S.waf_axtkampf.level, 3);
check("Axtkampf hängt an Axt & Beil", S.waf_axtkampf.parents, ["waf_axt"]);
check("Meister der Schlachtaxt baut auf Axtkampf", S.waf_hiebmeister.parents, ["waf_axtkampf", "waf_zweihand"]);
check("Meister der Schlachtaxt bleibt auf Ebene 4", S.waf_hiebmeister.level, 4);
check("Vorstufen von Meister der Schlachtaxt",
  [...ancestors(tree, "waf_hiebmeister")].sort(),
  ["waf_axt", "waf_axtkampf", "waf_klinge", "waf_nah", "waf_wucht", "waf_zweihand"]);
check("Nachfolger von Axt & Beil enthalten Axtkampf und den Meister",
  ["waf_axtkampf", "waf_hiebmeister", "waf_waffenmeister"].every(id => descendants(tree, "waf_axt").has(id)), true);

// --- Wirkung je Rarität ---
const lines = effectLines(tree, "waf_axt");
check("Axt & Beil: Zeilen ab Common", [lines.length, lines[0].rarity], [6, "Common"]);
check("Axt & Beil: Besonderheit bei Uncommon", Boolean(lines[1].extra), true);
check("Axtkampf: erste Rarität Uncommon", effectLines(tree, "waf_axtkampf")[0].rarity, "Uncommon");

// --- Eigener Skill: Licht der Macht, Ebene 1 ---
const licht = {
  name: "Licht der Macht", level: 1, domain: "magie", type: "A", attr: "WIS", res: "MP", parents: [],
  kern: "Du lässt einen Gegenstand oder eine Person leuchten, ohne zu blenden. Radius: Skill-Level × Raritätsstufe in Kästchen.",
  ms: "Rare: Das Licht folgt dem Ziel.\nTranszendiert: Das Licht erhellt ein ganzes Tal."
};
check("Licht der Macht ist gültig", validateCustom(tree, licht), { errors: [], warnings: [] });

const custom = makeCustomSkill(licht, "x_licht");
const withLight = buildTree(base, [custom]);
check("eigener Skill im Baum", withLight.skills.x_licht.level, 1);
check("eigener Skill: Einstiegsrarität Common", withLight.skills.x_licht.floor, "Common");
check("eigener Skill: Wurzel", withLight.skills.x_licht.kind, "Wurzel");
check("eigener Skill: Art Zauber", withLight.skills.x_licht.arch, "zauber");
check("eigener Skill: Rare-Besonderheit geparst", withLight.skills.x_licht.ms, { R: "Das Licht folgt dem Ziel.", T: "Das Licht erhellt ein ganzes Tal." });
check("Basisbaum bleibt unverändert", Boolean(S.x_licht), false);

// Abhängigkeiten: Ebene 2 auf dem eigenen Skill
const blitz = { name: "Gleißendes Licht", level: 2, domain: "magie", type: "A", attr: "WIS", res: "MP", parents: ["x_licht"], kern: "Ein greller Blitz." };
check("Ebene 2 auf eigenem Elternskill", validateCustom(withLight, blitz), { errors: [], warnings: [] });
const full = buildTree(base, [custom, makeCustomSkill(blitz, "x_blitz")]);
check("Kinder werden gesetzt", full.skills.x_licht.children, ["x_blitz"]);
check("Vorstufen eines eigenen Skills", [...ancestors(full, "x_blitz")], ["x_licht"]);

// Verschmelzung mit Basisskill
const mix = { ...blitz, name: "Heiliges Schwert", level: 5, domain: "kombi", type: "A", attr: "STR", parents: ["waf_schwert", "x_licht"] };
const mixCheck = validateCustom(withLight, mix);
check("Lücke zur Grundregel gibt einen Hinweis, keinen Fehler", [mixCheck.errors.length, mixCheck.warnings.length], [0, 1]);
const mixTree = buildTree(base, [custom, makeCustomSkill(mix, "x_mix")]);
check("Verschmelzung erkannt", mixTree.skills.x_mix.kind, "Verschmelzung");
check("Vorstufen reichen bis zur Wurzel", [...ancestors(mixTree, "x_mix")].sort(), ["waf_klinge", "waf_nah", "waf_schwert", "x_licht"]);

// --- Fehlerfälle ---
const errs = (input, id = null, t = withLight) => validateCustom(t, input, id).errors;
check("Ebene 1 mit Eltern", errs({ ...licht, name: "Neu", parents: ["waf_nah"] }).length > 0, true);
check("Ebene 2 ohne Eltern", errs({ ...licht, name: "Neu", level: 2 }).length > 0, true);
check("Eltern auf gleicher Ebene", errs({ ...licht, name: "Neu", level: 2, parents: ["waf_klinge"] }).length > 0, true);
check("doppelter Name (egal wie geschrieben)", errs({ ...licht, name: "  licht der MACHT " }).length > 0, true);
check("Bearbeiten des eigenen Namens bleibt erlaubt", errs(licht, "x_licht"), []);
check("Ebene 9 abgelehnt", errs({ ...licht, name: "Neu", level: 9 }).length > 0, true);
check("unbekannter Bereich", errs({ ...licht, name: "Neu", domain: "quatsch" }).length > 0, true);
check("unbekannter Elternskill", errs({ ...licht, name: "Neu", level: 2, parents: ["gibt_es_nicht"] }).length > 0, true);

// Ebene eines Skills mit Kindern nicht über die Kinder heben
check("Ebene anheben über das Kind hinaus", errs({ ...licht, level: 2, parents: ["waf_nah"] }, "x_licht", full).length > 0, true);
// Zyklus: Kind als Elternskill wählen
check("Kind als Elternskill", errs({ ...licht, level: 3, parents: ["x_blitz"] }, "x_licht", full).length > 0, true);

// Basis-Skills werden durch ungültige Eltern in eigenen Daten nicht beschädigt
const orphan = buildTree(base, [{ id: "x_waise", name: "Waise", level: 3, domain: "allgemein", type: "F", attr: "STR", parents: ["weg"] }]);
check("unbekannte Eltern werden verworfen", orphan.skills.x_waise.parents, []);
check("Skill-Zahl mit Waise", orphan.order.length, tree.order.length + 1);

// --- Wirkung, Voraussetzungen, Bogen-Eintrag ---
check("Anforderung je Ebene", [LEVEL_REQ[1], LEVEL_REQ[2], LEVEL_REQ[5], LEVEL_REQ[7]], [0, 5, 20, 40]);

const owned = [{ name: "Nahkampf", level: 7 }, { name: "axt & beil", level: 3 }];
const status = unlockStatus(tree, "waf_axtkampf", owned);
check("Axtkampf: Axt & Beil zu niedrig (3 von 10)", [status.ready, status.parents[0].level, status.parents[0].needed], [false, 3, 10]);
const ready = unlockStatus(tree, "waf_axt", owned);
check("Axt & Beil: bereits erworben", ready.owned, true);
check("Axt & Beil: Nahkampf 7 reicht für Ebene 2", unlockStatus(tree, "waf_klinge", owned).ready, true);
check("Wurzel ist immer freigeschaltet", unlockStatus(tree, "waf_nah", []).ready, true);
check("Skill ohne Elternskill im Bogen: nicht bereit", unlockStatus(tree, "waf_klinge", []).ready, false);

const entry = sheetEntry(S.waf_axtkampf);
check("Bogen-Eintrag", [entry.name, entry.rarity, entry.level, entry.attribute, entry.category],
  ["Axtkampf", "Uncommon", 1, "STR", "aktiv"]);
check("Kurzwirkung endet am ersten Satz", shortEffect({ kern: "Erster Satz. Zweiter Satz." }), "Erster Satz.");
check("Kurzwirkung kürzt lange Sätze", shortEffect({ kern: "a".repeat(300) }).length, 158);
check("Typ M wird Modifikation", sheetEntry({ name: "x", floor: "Common", attr: "DEX", type: "M", kern: "" }).category, "modifikation");

// --- Besonderheiten-Text ---
check("Besonderheiten: Kurzbuchstaben und deutsche Namen",
  parseMilestones("R: eins\nepisch - zwei\nmüll\nTranszendiert: drei"), { R: "eins", E: "zwei", T: "drei" });
check("Besonderheiten zurück in Text", formatMilestones({ R: "eins", T: "drei" }, base.rn), "Rare: eins\nTranszendiert: drei");


// --- Wizard-Pruefungen: Stilllegen und Schadensarten ---
const panzer = { name: "Panzerhaut", domain: "resistenz", type: "P", attr: "CON", level: 2,
                 parents: ["res_abhaert"], kern: "Test." };

check("Passiver Skill mit Schadensarten ist gueltig",
  validateCustom(tree, { ...panzer, types: ["hieb"], replaces: ["res_abhaert"] }).errors, []);

check("Stilllegen nur von eigenen Eltern",
  validateCustom(tree, { ...panzer, replaces: ["res_hieb"] }).errors.length, 1);

check("Schadensarten nur bei passiven Skills",
  validateCustom(tree, { ...panzer, type: "A", types: ["hieb"] }).errors.includes(
    "Schadensarten gibt es nur bei passiven Skills."), true);

check("Bedingung ohne Schadensart warnt",
  validateCustom(tree, { ...panzer, cond: "magie" }).warnings.includes(
    "Eine Bedingung ohne Schadensart bleibt wirkungslos."), true);

const gebaut = makeCustomSkill({ ...panzer, types: ["hieb", "wucht"], replaces: ["res_abhaert"], cond: "magie" }, "x_panzer");
check("Datensatz traegt Schadensarten", gebaut.types, ["hieb", "wucht"]);
check("Datensatz traegt Stilllegung", gebaut.replaces, ["res_abhaert"]);
check("Datensatz traegt Bedingung", gebaut.cond, "magie");

const aktiv = makeCustomSkill({ ...panzer, type: "A", types: ["hieb"], cond: "magie" }, "x_aktiv");
check("Aktiver Skill bekommt keine Schadensarten", aktiv.types, []);
check("Aktiver Skill bekommt keine Bedingung", aktiv.cond, "");


// --- Resistenzangaben muessen aus den Daten in den Baum durchkommen -------
// Fehlte in shape(), womit die Schadensreduktion im Bogen auf 0 blieb.
const byName = (name) => Object.values(S).find(skill => skill.name === name);
check("Hiebresistenz traegt die Schadensart", byName("Hiebresistenz").types, ["hieb"]);
check("Dicke Haut traegt drei Schadensarten",
  byName("Dicke Haut").types, ["hieb", "stich", "wucht"]);
check("Dicke Haut legt die Eltern still",
  byName("Dicke Haut").replaces.map(id => S[id].name),
  ["Hiebresistenz", "Stichresistenz", "Wuchtresistenz"]);
check("Arkane Resistenz ist bedingt", byName("Arkane Resistenz").cond, "magie");
check("Ein Waffenskill hat keine Schadensart", byName("Axtkampf").types, []);

// Und von dort in den Bogeneintrag, mit Namen statt Ids
const dickeHaut = sheetEntry(byName("Dicke Haut"), [10, 10, 10], tree);
check("Bogeneintrag traegt die Schadensarten", dickeHaut.types, "hieb,stich,wucht");
check("Bogeneintrag nennt die Eltern beim Namen",
  dickeHaut.replaces, "Hiebresistenz,Stichresistenz,Wuchtresistenz");


// --- Steigerungen kommen aus den Daten in den Baum ------------------------
check("Ausweichen steigert den Verteidigungswert",
  byName("Ausweichen").boosts, [{ t: "vw" }]);
check("Vorausahnung steigert VW und Initiative halbiert",
  byName("Vorausahnung").boosts.filter(boost => !boost.s),
  [{ t: "vw", f: "half" }, { t: "init", f: "half" }]);
check("Turmschild nur in einer Lage",
  byName("Turmschild").boosts[0].s, "gegen Angriffe von vorn");
check("Ruestungstragen senkt den Malus um ein Fuenftel",
  byName("Rüstungstragen").boosts, [{ t: "armormalus", f: "fifth" }]);
check("ein Wissensskill steigert nichts", byName("Naturkunde").boosts, []);

const mitBoost = makeCustomSkill(
  { ...panzer, boosts: [{ t: "vw", f: "half", s: "" }] }, "x_boost");
check("eigener Skill traegt die Steigerung", mitBoost.boosts, [{ t: "vw", f: "half" }]);
const standardBoost = makeCustomSkill(
  { ...panzer, boosts: [{ t: "init", f: "standard" }] }, "x_boost2");
check("die Standardregel wird nicht mitgeschrieben", standardBoost.boosts, [{ t: "init" }]);
const unbekannt = makeCustomSkill({ ...panzer, boosts: [{ t: "quatsch" }] }, "x_boost3");
check("unbekanntes Ziel fliegt raus", unbekannt.boosts, []);


// --- Tabelle im Bogen kommt aus dem Baum ----------------------------------
check("Resistenz-Skills gehen in die Resistenz-Tabelle",
  sheetCategory(byName("Hiebresistenz")), "resistenz");
check("auch die ohne Schadensart", sheetCategory(byName("Willensstärke")), "resistenz");
check("ein passiver Skill ausserhalb des Bereichs bleibt passiv",
  sheetCategory(byName("Zauberkontrolle")), "passiv");
check("Abwehr bleibt aktiv", sheetCategory(byName("Ausweichen")), "aktiv");
check("Modifikationen bleiben Modifikationen",
  sheetCategory(byName("Gezielter Schlag")), "modifikation");
check("der Bogeneintrag traegt sie mit",
  sheetEntry(byName("Hiebresistenz"), [10]).category, "resistenz");
check("eigener Skill mit gesetzter Tabelle",
  makeCustomSkill({ ...panzer, cat: "resistenz" }, "x_cat").cat, "resistenz");
check("unbekannte Tabelle faellt auf den Typ zurueck",
  sheetCategory(makeCustomSkill({ ...panzer, cat: "quatsch" }, "x_cat2")), "passiv");

// Alle 29 Skills des Bereichs Resistenz landen dort
const resistenzTabelle = Object.values(S).filter(skill => sheetCategory(skill) === "resistenz");
check("alle Resistenz-Skills aus dem Bereich Resistenz",
  resistenzTabelle.length,
  Object.values(S).filter(skill => skill.domain === "resistenz").length);
check("und alle aus dem Bereich Resistenz",
  resistenzTabelle.every(skill => skill.domain === "resistenz"), true);


// --- Rechenregel kommt aus dem Baum --------------------------------------
check("ohne Angabe leer", byName("Hiebresistenz").bonusMode, "");
const eigenerModus = makeCustomSkill({ ...panzer, bonusMode: "factor" }, "x_mod");
check("eigener Skill speichert sie", eigenerModus.bm, "factor");
check("und der Baum liest sie wieder",
  buildTree(base, [eigenerModus]).skills.x_mod.bonusMode, "factor");
check("Unsinn wird nicht gespeichert",
  makeCustomSkill({ ...panzer, bonusMode: "quatsch" }, "x_mod2").bm, "");


// --- Steigerungen auf Proben ---------------------------------------------
// Alle mit Lage: sie gelten gegen etwas Bestimmtes, und was gerade gewuerfelt
// wird, weiss der Bogen nicht.
const probenBoosts = Object.values(S)
  .filter(skill => skill.boosts.some(boost => boost.t === "check"));
check("mehrere Skills steigern Proben", probenBoosts.length >= 14, true);
check("und alle nur in einer Lage",
  probenBoosts.every(skill => skill.boosts.filter(b => b.t === "check").every(b => b.s)), true);
check("Willensstaerke gegen Beeinflussung",
  byName("Willensstärke").boosts.find(b => b.t === "check").s, "Proben gegen Beeinflussung");
check("Tierempathie rechnet mit dem Level",
  byName("Tierempathie").boosts.find(b => b.t === "check").f, "level");
check("Vorausahnung behaelt ihre anderen Steigerungen",
  byName("Vorausahnung").boosts.map(b => b.t), ["vw", "init", "check"]);

check("Diplomatie rechnet mit der Machtstufe", byName("Diplomatie").bonusMode, "factor");
check("Handel ebenso", byName("Handel").bonusMode, "factor");
check("ein anderer Fertigkeitsskill nicht", byName("Athletik").bonusMode, "");


// --- Ausfuellhilfe fuer "Neu pro Raritaet" --------------------------------
const zeilen = (text) => text.split(String.fromCharCode(10));

const leer = milestoneTemplate("", 3, base.rn);
check("Vorlage beginnt bei der Einstiegsraritaet", zeilen(leer)[0], "Rare: ");
check("und reicht bis Transzendiert", zeilen(leer).length, 4);
check("eine leere Vorlage ergibt keine Eintraege", parseMilestones(leer), {});
check("Common beginnt bei Common", zeilen(milestoneTemplate("", 1, base.rn)).length, 6);

const getippt = "Rare: trifft doppelt" + String.fromCharCode(10) + "Legendary: dreifach";
const gefuellt = milestoneTemplate(getippt, 3, base.rn);
check("Geschriebenes bleibt stehen", parseMilestones(gefuellt),
  { R: "trifft doppelt", L: "dreifach" });
check("und die Luecken dazwischen werden angeboten", zeilen(gefuellt), [
  "Rare: trifft doppelt", "Epic: ", "Legendary: dreifach", "Transzendiert: "
]);

// Steigt die Ebene, faellt nur weg, was leer war
const hoeher = milestoneTemplate(gefuellt, 4, base.rn);
check("leere Zeile unter der neuen Einstiegsraritaet faellt weg",
  zeilen(hoeher).includes("Rare: "), false);
check("getippte Zeile darunter bleibt", zeilen(hoeher)[0], "Rare: trifft doppelt");

check("nur Leerzeichen zaehlt nicht als Eintrag",
  parseMilestones("Rare:    "), {});
check("ein Eintrag mit Leerzeichen davor zaehlt",
  parseMilestones("Rare:   trifft doppelt"), { R: "trifft doppelt" });


// --- Mitgelieferte Skills ueberschreiben ---------------------------------
// Aenderungen des Spielleiters liegen in der Welt, nicht in der Datei des
// Moduls. Ein Datenupdate darf sie deshalb nicht ueberschreiben.
const original = byName("Hiebresistenz");
const geaendert = makeCustomSkill({
  ...original,
  name: "Hiebresistenz",
  kern: "Vom Spielleiter umgeschrieben.",
  level: original.level,
  domain: original.domain,
  attr: "STR",
  type: original.type,
  cat: "resistenz",
  types: ["hieb", "wucht"]
}, original.id);

const mitAenderung = buildTree(base, [geaendert]);
const drin = mitAenderung.skills[original.id];
check("die Aenderung ersetzt den Skill", drin.kern, "Vom Spielleiter umgeschrieben.");
check("und behaelt seine Id", drin.id, original.id);
check("der Baum wird nicht groesser", mitAenderung.order.length, tree.order.length);
check("sie gilt als geaendert, nicht als eigener Skill",
  [drin.changed, drin.custom], [true, false]);
check("das Attribut ist uebernommen", drin.attr, "STR");
check("die Schadensarten auch", drin.types, ["hieb", "wucht"]);
check("der Archetyp bleibt, also auch die Raritaetsleiter", drin.arch, original.arch);
check("Kinder haengen weiter daran",
  mitAenderung.skills[original.id].children.length, original.children.length);

// Dasselbe mit spaeter geaenderten Baumdaten: die Aenderung gewinnt
const spaeter = JSON.parse(JSON.stringify(base));
spaeter.skills[original.id].kern = "Neuer Text aus einem Modul-Update.";
const nachUpdate = buildTree(spaeter, [geaendert]);
check("ein Datenupdate ueberschreibt die Aenderung nicht",
  nachUpdate.skills[original.id].kern, "Vom Spielleiter umgeschrieben.");

// Ohne Aenderung kommt der neue Text durch
check("ohne Aenderung kommt der neue Text an",
  buildTree(spaeter, []).skills[original.id].kern, "Neuer Text aus einem Modul-Update.");

// Ein eigener Skill bleibt ein eigener Skill
const eigen = buildTree(base, [makeCustomSkill({ ...panzer }, "x_eigen")]).skills.x_eigen;
check("eigener Skill bleibt als solcher markiert", [eigen.custom, eigen.changed], [true, false]);


// --- Jeder Skill muss von Ebene 1 aus erreichbar sein --------------------
// Der Baum faengt bei Ebene 1 an. Ein Skill, dessen Weg dorthin abreisst,
// liesse sich nie erwerben.
const erreichbar = new Map();
const fuehrtZuEbene1 = (id, pfad = new Set()) => {
  if (erreichbar.has(id)) return erreichbar.get(id);
  const skill = S[id];
  let ok;
  if (skill.level === 1) ok = true;
  else if (!skill.parents.length) ok = false;
  else ok = skill.parents.some(parent => !pfad.has(parent) &&
    fuehrtZuEbene1(parent, new Set([...pfad, id])));
  erreichbar.set(id, ok);
  return ok;
};
const abgehaengt = tree.order.filter(id => !fuehrtZuEbene1(id));
check("jeder Skill fuehrt zurueck auf Ebene 1", abgehaengt.map(id => S[id].name), []);
check("ab Ebene 2 hat jeder Skill Eltern",
  tree.order.filter(id => S[id].level > 1 && !S[id].parents.length), []);
check("jede Ebene ist tiefster Elternskill + 1",
  tree.order.filter(id => {
    const tiefste = Math.max(0, ...S[id].parents.map(p => S[p].level));
    return S[id].level !== tiefste + 1;
  }).map(id => S[id].name), []);

// Jeder Bereich ausser den Verschmelzungen hat einen eigenen Einstieg: sonst
// sieht ein Skill im eigenen Reiter wurzellos aus.
const ohneEigeneWurzel = tree.order
  .map(id => S[id])
  .filter(skill => skill.level > 1 && skill.parents.length &&
    skill.parents.every(parent => S[parent].domain !== skill.domain));
check("nur Verschmelzungen haengen ganz an anderen Bereichen",
  [...new Set(ohneEigeneWurzel.map(skill => skill.domain))], ["kombi"]);
check("jeder Bereich ausser Verschmelzungen hat einen Skill auf Ebene 1",
  base.doms.filter(domain => domain !== "kombi" &&
    !tree.order.some(id => S[id].domain === domain && S[id].level === 1)), []);


// --- Der Weg von Ebene 1 steht am Skill ----------------------------------
const { pathToRoot } = await import("../scripts/tree-view.js");
check("jeder Weg beginnt auf Ebene 1",
  tree.order.filter(id => pathToRoot(tree, id)[0].level !== 1).map(id => S[id].name), []);
check("jeder Weg endet beim Skill selbst",
  tree.order.filter(id => pathToRoot(tree, id).at(-1).id !== id).map(id => S[id].name), []);
check("jeder Schritt ist ein Elternskill des naechsten",
  tree.order.filter(id => {
    const weg = pathToRoot(tree, id);
    return weg.some((eintrag, i) => i > 0 && !S[eintrag.id].parents.includes(weg[i - 1].id));
  }).map(id => S[id].name), []);
check("Elektronik kommt von Handwerkskunde",
  pathToRoot(tree, byName("Elektronik").id).map(e => e.name),
  ["Handwerkskunde", "Elektronik"]);


// --- Die Ruestungsskills senken den Malus --------------------------------
const senkt = (name) => byName(name).boosts.filter(boost => boost.t === "armormalus");
check("Ruestungstragen senkt", senkt("Rüstungstragen").length, 1);
check("Schildfuehrung auch", senkt("Schildführung").length, 1);
check("Ruestungsmeister ohne Deckel",
  senkt("Rüstungsmeister"), [{ t: "armormalus" }]);
check("die drei Ruestungsarten nur fuer ihre eigene",
  ["Leichte Rüstung", "Mittlere Rüstung", "Schwere Rüstung"]
    .every(name => senkt(name).every(boost => boost.s)), true);
check("ein Zauber senkt keinen Ruestungsmalus",
  Object.values(S).filter(skill => skill.domain === "magie" &&
    skill.boosts.some(boost => boost.t === "armormalus")).map(skill => skill.name), []);

if (fails) {
  console.log(`\n${fails} Test(s) fehlgeschlagen`);
  process.exit(1);
}
console.log("\nalle Tests bestanden");
