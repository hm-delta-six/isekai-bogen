import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ancestors, buildTree, descendants, effectLines, formatMilestones, LEVEL_FLOOR, LEVEL_REQ,
  makeCustomSkill, parseMilestones, sheetEntry, shortEffect, unlockStatus, validateCustom
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
check("Anzahl Skills", tree.order.length, 304);
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
check("Skill-Zahl mit Waise", orphan.order.length, 305);

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

if (fails) {
  console.log(`\n${fails} Test(s) fehlgeschlagen`);
  process.exit(1);
}
console.log("\nalle Tests bestanden");
