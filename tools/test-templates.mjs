// Uebersetzt die Handlebars-Templates und rendert sie einmal.
//
// Ein unausgeglichener {{#if}}/{{#each}}-Block oder ein falsch verschachteltes
// Tag faellt in Foundry erst beim Oeffnen des Bogens auf. Hier faellt es sofort
// auf. Braucht handlebars: npm install --no-save handlebars
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
let Handlebars;
try {
  Handlebars = (await import("handlebars")).default;
} catch {
  console.log("uebersprungen: handlebars fehlt (npm install --no-save handlebars)");
  process.exit(0);
}

// Foundrys eigene Helfer, soweit die Templates sie nutzen.
Handlebars.registerHelper("selectOptions", (choices, options) => {
  const selected = options?.hash?.selected;
  return new Handlebars.SafeString(Object.entries(choices || {})
    .map(([key, label]) => `<option value="${key}"${key === selected ? " selected" : ""}>${label}</option>`)
    .join(""));
});

let fails = 0;
const templates = {};
for (const name of readdirSync(join(root, "templates")).filter(file => file.endsWith(".html")).sort()) {
  try {
    templates[name] = Handlebars.compile(readFileSync(join(root, "templates", name), "utf8"), { strict: false });
    console.log(`ok   ${name} laesst sich uebersetzen`);
  } catch (error) {
    fails += 1;
    console.log(`FAIL ${name} laesst sich nicht uebersetzen\n  ${error.message}`);
  }
}

// Ein Kontext, der jede Schleife im Bogen einmal durchlaeuft.
const skill = {
  name: "Dicke Haut", rarity: "Rare", level: 15, attribute: "CON", category: "passiv",
  cap: 60, bonus: 22, effect: "Mindert Hiebschaden", types: "hieb,stich,wucht",
  replaces: "Hiebresistenz", cond: "", retired: false,
  resistTypes: "Hieb, Stich, Wucht", resistValue: 60,
  boostText: "+24 Verteidigungswert"
};
const sheetContext = {
  actor: {
    name: "Hookwolf",
    system: {
      abilities: { STR: { value: 10 } }, boni: {}, details: {}, isekai: {},
      isekaiSkills: [skill],
      weapons: [{ name: "Klinge", dice: "1d8", rarity: "Rare", types: "hieb", mods: [{ skillName: "Rundumschlag" }] }],
      armors: [{ name: "Panzer", dr: 6, durability: 20, types: "hieb" }],
      resistances: [{ name: "Feuerschutz", rarity: "Rare", skillName: "Feuerresistenz", types: "feuer" }],
      equipment: [{ name: "Seil" }], titles: [{ name: "Held", type: "STR", bonus: 2 }], skills: []
    }
  },
  derived: { initTotal: 3, awTotal: 20, vwTotal: 18, defenceAttr: 12 },
  defence: { name: "Ausweichen", level: 8, factor: 4, rarity: "Rare", attribute: "DEX", missing: false },
  defenceSkillChoices: { "": "kein Abwehr-Skill", Ausweichen: "Ausweichen (8, DEX)" },
  awHelp: "Grundwert 10 + AW-Skill 5 + STR 12 (10 + 2 aus Titeln) + Boni 0 = 27.",
  vwHelp: "Grundwert 10 + Extra 0 + DEX 12 + Boni 0 + Skills 24 - Ruestungsmalus 3 = 43.",
  initHelp: "DEX 10 + Boni 0 = 10.",
  effectiveAbilities: { STR: 10, DEX: 10, CON: 14, INT: 8, WIS: 8, CHA: 8 },
  rarityChoices: { Common: "Common", Rare: "Rare" },
  attributeChoices: { STR: "STR", CON: "CON" },
  titleTypeChoices: { STR: "STR" }, diceChoices: { "1d8": "W8" },
  damageTypes: { hieb: "Hieb", feuer: "Feuer" }, areaModes: { single: "Einzelangriff" },
  skillCategories: { passiv: "Passive Skills" }, modBonusTypes: { targets: "Anzahl Gegner" },
  costTypes: { ap: "AP" }, armorWearChoices: { highest: "hoechste DR" },
  weaponSkillChoices: { "": "waehlen" }, modSkillChoices: { "": "waehlen" },
  resistanceFormula: "Skill-Level x Machtfaktor",
  drByType: [{ label: "Hieb", flat: 146, cond: 0 }],
  drSources: [{ name: "Dicke Haut", value: 60, cond: "", types: ["hieb"] }],
  drConditional: [{ name: "Arkane Resistenz", value: 80, cond: "magie" }],
  drRetiredNames: ["Hiebresistenz"],
  __erwartet: [
    "Grundwert 10 + AW-Skill 5",          // Hilfe am AW
    "Ruestungsmalus 3",                   // Hilfe am VW
    'name="system.boni.vwSkillName"',     // Auswahl des Abwehr-Skills
    "Steigert +24 Verteidigungswert",     // Steigerung am Skill
    "Hieb <strong>146</strong>",          // DR je Schadensart
    "Resistenz 60 gegen Hieb, Stich, Wucht", // Resistenz am Skill
    "Hiebresistenz"                       // stillgelegt genannt
  ],
  skillGroups: [{
    key: "passiv", label: "Passive Skills", hint: "Immer aktiv", formula: "Level x Stufe / 2",
    usesAttribute: false, entries: [{ index: 0, skill }]
  }]
};

const treeContext = {
  isGM: true, actorName: "Hookwolf", query: "",
  columns: [{ level: 1, skills: [{ id: "a", name: "Dicke Haut", rarity: "Rare", cls: "", lname: "dicke haut" }] }],
  detail: {
    id: "a", name: "Dicke Haut", level: 3, floor: "Rare", kind: "Verschmelzung", custom: false,
    domainLabel: "Resistenz", attr: "CON", typeLabel: "Passiv", res: "", kern: "Mindert Schaden",
    hasActor: true, actorName: "Hookwolf", owned: true, ownedLevel: 15, needed: 10, canAdd: false,
    parents: [{ id: "b", name: "Hiebresistenz", rarity: "Uncommon", level: 10, needed: 10, ok: true, hint: "" }],
    ancestors: [], children: [],
    formula: "Schadensreduktion = Skill-Level x Machtfaktor",
    payoff: { head: "Level 15, Rare", lines: ["Schadensreduktion <b>60</b> gegen Hieb"], sample: false },
    effects: [{ rank: 3, rarity: "Rare", base: "Machtfaktor 4", extra: null }]
  }
};

for (const [name, context] of [["sheet.html", sheetContext], ["skill-tree.html", treeContext]]) {
  if (!templates[name]) continue;
  try {
    const html = templates[name](context);
    if (!html.includes("<")) throw new Error("leeres Ergebnis");
    // Ein Platzhalter, der nie gefuellt wird, faellt sonst nicht auf.
    for (const marker of (context.__erwartet || [])) {
      if (!html.includes(marker)) throw new Error(`"${marker}" fehlt im Ergebnis`);
    }
    console.log(`ok   ${name} rendert (${html.length} Zeichen)`);
  } catch (error) {
    fails += 1;
    console.log(`FAIL ${name} rendert nicht\n  ${error.message}`);
  }
}

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
