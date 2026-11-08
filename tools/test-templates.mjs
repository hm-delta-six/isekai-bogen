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
      weapons: [{ name: "Klinge", dice: "1d8", rarity: "Rare", types: "hieb",
        awHelp: "AW 40 = Grundwert 10 + Schwertkampf 8 x Stufe 3 = 24 + STR 6",
        damageHelp: "Schaden (W8 + 1) x 4 + 30 = ...",
        mods: [{ skillName: "Rundumschlag" }] }],
      armors: [{ name: "Panzer", dr: 6, durability: 20, types: "hieb" }],
      resistances: [{ name: "Feuerschutz", rarity: "Rare", skillName: "Feuerresistenz", types: "feuer" }],
      equipment: [{ name: "Amulett", type: "VW", bonus: 2, quantity: 1, effect: "" }],
      titles: [{ name: "Held", type: "STR", bonus: 2 }], skills: []
    }
  },
  derived: { initTotal: 3, awTotal: 20, vwTotal: 18, defenceAttr: 12 },
  defence: { name: "Ausweichen", amount: 24, attribute: "DEX" },

  awHelp: "Grundwert 10 + AW-Skill 5 + STR 12 (10 + 2 aus Titeln) + Boni 0 = 27.",
  vwHelp: "Grundwert 10 + Extra 0 + DEX 12 + Boni 0 + Skills 24 - Ruestungsmalus 3 = 43.",
  initHelp: "DEX 10 + Boni 0 = 10.",
  effectiveAbilities: { STR: 10, DEX: 10, CON: 14, INT: 8, WIS: 8, CHA: 8 },
  rarityChoices: { Common: "Common", Rare: "Rare" },
  attributeChoices: { STR: "STR", CON: "CON" },
  titleTypeChoices: { STR: "STR" }, equipmentTypeChoices: { "": "-", STR: "STR", VW: "VW" },
  diceChoices: { "1d8": "W8" },
  damageTypes: { hieb: "Hieb", feuer: "Feuer" }, areaModes: { single: "Einzelangriff" },
  skillCategories: { passiv: "Passive Skills", resistenz: "Resistenzen" },
  modBonusTypes: { targets: "Anzahl Gegner" },
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
    "Steigert +24 Verteidigungswert",     // Steigerung am Skill
    "Abwehr: Ausweichen (+24), Attribut DEX",
    // Handlebars schreibt "=" als &#x3D;, deshalb ohne Gleichheitszeichen
    "Grundwert 10 + Schwertkampf 8 x Stufe 3",  // Hilfe am Angriffswert
    "Schaden (W8 + 1) x 4",                     // Hilfe am Schaden
    'name="system.equipment.0.type"',     // Ausruestung kann einen Wert heben
    'name="system.equipment.0.bonus"',
    "Resistenzen",                        // eigene Tabelle fuer Resistenzen
    "Resistenzen aus anderen Quellen",    // die alte Tabelle, umbenannt
    "Hieb <strong>146</strong>",          // DR je Schadensart
    "Resistenz 60 gegen Hieb, Stich, Wucht", // Resistenz am Skill
    "Hiebresistenz"                       // stillgelegt genannt
  ],
  skillGroups: [{
    key: "passiv", label: "Passive Skills", hint: "Immer aktiv", formula: "Level x Stufe / 2",
    usesAttribute: false, entries: []
  }, {
    key: "resistenz", label: "Resistenzen", hint: "Mindern Schaden einer Art",
    formula: "Level x Machtfaktor", usesAttribute: false, entries: [{ index: 0, skill }]
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


// --- Der Skill-Baum als eigenstaendige Datei ------------------------------
// Sie soll aussehen und arbeiten wie das Fenster: dieselben Klassen, dasselbe
// Stylesheet, dieselbe Aufbereitung.
const { treeHtml, styleFromTemplate } = await import("../scripts/tree-export.js");
const baumDaten = JSON.parse(readFileSync(join(root, "data/skill-baum.json"), "utf8"));
const baumTemplate = readFileSync(join(root, "templates/skill-tree.html"), "utf8");

const eigener = {
  id: "x_pruefstein", name: "Pruefstein", domain: "allgemein", parents: [], attr: "STR",
  type: "P", res: "", level: 1, kern: "Nur zum Pruefen da.", ms: {},
  types: [], replaces: [], cond: "", cat: "", bm: "", boosts: [{ t: "init" }]
};
const seite = treeHtml(baumDaten, [eigener], { template: baumTemplate });

const pruef = (name, bedingung) => {
  if (bedingung) console.log(`ok   ${name}`);
  else { fails += 1; console.log(`FAIL ${name}`); }
};

// Das Stylesheet kommt aus dem Template, nicht aus einer zweiten Kopie.
const stil = styleFromTemplate(baumTemplate);
pruef("Stylesheet wird aus dem Template gelesen", stil.includes(".st-chip"));
pruef("und steht in der Datei", seite.includes(stil.trim().slice(0, 120)));

// Jede Klasse, die das Fenster-Template fuer den Baum benutzt, muss auch in
// der Datei vorkommen — sonst sieht sie anders aus. Die Kaestchen und das
// Detail entstehen dort beim Laden, ihre Klassen stehen also in den Daten.
const klassenAus = (text) => new Set([...text.matchAll(/class="([^"]+)"/g)]
  .flatMap(match => match[1].split(/[ ]+/))
  .filter(name => (name.startsWith("st-") || name.startsWith("r-")) && !name.includes("{{")));
const imFenster = klassenAus(baumTemplate);
// Diese gibt es nur in Foundry: Export- und Anlegen-Knopf sowie die
// Knopfreihe, die einen Charakter braucht.
for (const nurFoundry of ["st-export", "st-new", "st-actions", "st-btn", "st-add", "st-edit", "st-delete"]) {
  imFenster.delete(nurFoundry);
}
const fehlend = [...imFenster].filter(name => !seite.includes(name));
pruef(`alle ${imFenster.size} Klassen des Fensters kommen vor` +
  (fehlend.length ? ` (fehlt: ${fehlend.join(", ")})` : ""), fehlend.length === 0);

// Inhalt: alle Skills, eigene dabei, die Regeln, nichts von aussen
const marke = seite.indexOf('id="st-daten"');
const roh = seite.slice(seite.indexOf(">", marke) + 1, seite.indexOf("<" + "/scr" + "ipt>", marke));
const eintraege = JSON.parse(roh.split(String.fromCharCode(60, 92, 47)).join("<" + "/"));
pruef(`Daten enthalten alle ${Object.keys(baumDaten.skills).length + 1} Skills`,
  Object.keys(eintraege.detail).length === Object.keys(baumDaten.skills).length + 1);
pruef("der eigene Skill ist dabei", Boolean(eintraege.detail.x_pruefstein));
// st-tabs faengt genauso an, deshalb das Zeichen danach mitpruefen
pruef("Reiter fuer jeden Bereich und Alle",
  (seite.match(/class="st-tab[" ]/g) || []).length === baumDaten.doms.length + 1);
pruef("Spalten je Reiter vorbereitet", Object.keys(eintraege.spalten).length === baumDaten.doms.length + 1);
pruef("Vorstufen und Nachfolger je Skill", Array.isArray(eintraege.rel.x_pruefstein.anc));
pruef("Suchfeld vorhanden", seite.includes('class="st-search"'));
pruef("Regeln stehen darunter", seite.includes("Schadensreduktion") && seite.includes("Machtfaktor"));
pruef("nichts wird von aussen geladen", !/src="http|href="http|<link/.test(seite));

// Im Detail steht, was der Skill bringt, und die Resistenz nur einmal
const dickeHaut = Object.entries(eintraege.detail)
  .find(([, html]) => html.includes("<h3>Dicke Haut</h3>"))[1];
// Im Kasten "Was der Skill bringt" steht die Reduktion genau einmal; die
// Rechenregel darunter nennt sie noch einmal als Formel, das ist gewollt.
const kasten = dickeHaut.slice(dickeHaut.indexOf("st-payoff"), dickeHaut.indexOf("st-note"));
pruef("Detail nennt die Schadensreduktion genau einmal",
  (kasten.match(/Schadensreduktion/g) || []).length === 1);
pruef("Detail nennt die Eltern", dickeHaut.includes("Hiebresistenz"));
pruef("Detail nennt die Raritaetsleiter", dickeHaut.includes("st-eff"));
pruef("Detail nennt die Tabelle im Bogen", dickeHaut.includes("Resistenzen"));

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
