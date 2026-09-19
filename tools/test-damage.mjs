import { resolveDamage, armorState, resistanceAgainst } from "../scripts/damage.js";
import { resistanceCapFactor } from "../scripts/rules.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

const actor = ({ armors = [], resistances = [], skills = [], hp = 100, wear = "highest" } = {}) => ({
  system: { armors, resistances, isekaiSkills: skills, armorWear: wear, resources: { hp: { value: hp } } }
});

// --- Ruestung: DR-Summe, defekte Teile, Typen ---
const a = actor({ armors: [
  { name: "Helm",   dr: 2, durability: 5,  types: ["hieb", "stich", "wucht"] },
  { name: "Panzer", dr: 6, durability: 20, types: ["hieb", "stich", "wucht"] },
  { name: "Schild", dr: 4, durability: 0,  types: ["hieb"] }
]});
check("DR gegen Wucht ohne defektes Teil", armorState(a, "wucht").totalDR, 8);
check("DR gegen Feuer: kein Teil deckt es ab", armorState(a, "feuer").totalDR, 0);

const r1 = resolveDamage(a, 20, { types: ["wucht"], rarity: "Common" });
check("HP-Verlust nach DR", r1.hpLoss, 12);
check("HP danach", r1.hpAfter, 88);
check("Verschleiss am Teil mit hoechster DR", r1.wear, [{ index: 1, wear: 12, from: 20, to: 8 }]);

const r2 = resolveDamage(a, 20, { types: ["feuer"], rarity: "Common" });
check("ungedeckter Typ: volle 20 Schaden", r2.hpLoss, 20);
check("ungedeckter Typ: kein Verschleiss an Hieb-Ruestung", r2.wear, []);

// Teil ohne Typenauswahl schuetzt gegen alles (Altbestand)
const alt = actor({ armors: [{ name: "Alte Ruestung", dr: 5, durability: 10 }] });
check("Altbestand ohne Typen schuetzt gegen Feuer", armorState(alt, "feuer").totalDR, 5);

// --- Bester Durchgriff bei mehreren Typen ---
const b = actor({ armors: [
  { name: "Plattenpanzer", dr: 6, durability: 20, types: ["hieb", "stich", "wucht"] },
  { name: "Umhang",        dr: 2, durability: 8,  types: ["feuer", "energie"] }
]});
const r3 = resolveDamage(b, 20, { types: ["hieb", "feuer"], rarity: "Common" });
check("bester Durchgriff waehlt Feuer", r3.type, "feuer");
check("bester Durchgriff: 20 - 2 DR", r3.hpLoss, 18);
check("beide Typen werden genannt", r3.consideredTypes, ["Hieb", "Feuer"]);

// --- Verteilte Abnutzung ---
const c = actor({
  armors: [
    { name: "Helm",   dr: 2, durability: 5,  types: ["wucht"] },
    { name: "Panzer", dr: 6, durability: 20, types: ["wucht"] }
  ],
  wear: "spread"
});
const r4 = resolveDamage(c, 15, { types: ["wucht"], rarity: "Common" });
check("verteilt: HP-Verlust", r4.hpLoss, 7);
check("verteilt: Aufteilung", r4.wear.map(w => w.wear), [4, 3]);

// --- Deckeltabelle aus Kapitel 9.3 ---
check("2 Stufen hoeher = 100%", resistanceCapFactor("Rare", "Common"), 1);
check("1 Stufe hoeher = 75%",   resistanceCapFactor("Uncommon", "Common"), 0.75);
check("gleiche Stufe = 50%",    resistanceCapFactor("Common", "Common"), 0.5);
check("1 Stufe niedriger = 25%", resistanceCapFactor("Common", "Uncommon"), 0.25);
check("2 Stufen niedriger = 0%", resistanceCapFactor("Common", "Rare"), 0);

// --- Beispieltabelle des Wikis nachgerechnet: 60 Schaden, Common-Angriff ---
const mitResistenz = (rarity, level) => actor({
  resistances: [{ name: "Feuerresistenz", rarity, skillName: "Feuerresistenz", types: ["feuer"] }],
  skills: [{ name: "Feuerresistenz", level }]
});

const durchkommend = (rarity, level) =>
  resolveDamage(mitResistenz(rarity, level), 60, { types: ["feuer"], rarity: "Common" }).hpLoss;

check("Wiki: Common Level 5 -> 55",    durchkommend("Common", 5), 55);
check("Wiki: Common Level 20 -> 40",   durchkommend("Common", 20), 40);
check("Wiki: Uncommon Level 10 -> 40", durchkommend("Uncommon", 10), 40);
check("Wiki: Rare Level 15 -> 15",     durchkommend("Rare", 15), 15);
check("Wiki: Epic Level 20 -> 0",      durchkommend("Epic", 20), 0);

// --- Allgemeine Resistenz: Level x (Stufe - 1), mindestens Level / 2 ---
const allgemein = actor({
  resistances: [{ name: "Panzerhaut", rarity: "Rare", skillName: "Panzerhaut", types: ["feuer", "kaelte", "elektrizitaet"] }],
  skills: [{ name: "Panzerhaut", level: 10 }]
});
const best = resistanceAgainst(allgemein, "feuer", 100, "Common");
check("allgemein: als allgemein erkannt", best.general, true);
check("allgemein: 10 x (3-1) = 20", best.raw, 20);

const spezial = actor({
  resistances: [{ name: "Feuerhaut", rarity: "Rare", skillName: "Feuerhaut", types: ["feuer"] }],
  skills: [{ name: "Feuerhaut", level: 10 }]
});
check("spezialisiert: 10 x 3 = 30", resistanceAgainst(spezial, "feuer", 100, "Common").raw, 30);

// --- Reihenfolge: erst Ruestung, dann Resistenz ---
const beides = actor({
  armors: [{ name: "Umhang", dr: 10, durability: 20, types: ["feuer"] }],
  resistances: [{ name: "Feuerresistenz", rarity: "Common", skillName: "Feuerresistenz", types: ["feuer"] }],
  skills: [{ name: "Feuerresistenz", level: 5 }]
});
const r5 = resolveDamage(beides, 60, { types: ["feuer"], rarity: "Common" });
check("Ruestung zuerst: 60 - 10 DR", r5.afterArmor, 50);
check("dann Resistenz: 5 x 1 = 5", r5.resisted, 5);
check("Ergebnis 45", r5.hpLoss, 45);
check("Verschleiss zaehlt vor der Resistenz", r5.wear[0].wear, 50);

// --- Ohne Ruestung, ohne Typ ---
const nackt = actor();
check("ohne alles: voller Schaden", resolveDamage(nackt, 13, {}).hpLoss, 13);
check("HP-Boden bei 0", resolveDamage(actor({ hp: 4 }), 50, {}).hpAfter, 0);

// --- Waffen-Skill und Schadensbonus ---
const { weaponSkill, damageBonus } = await import("../scripts/attack.js");

const held = {
  system: {
    abilities: { STR: { value: 6 } },
    boni: { awSkill: 5 },
    titles: [{ type: "STR", bonus: 2 }],
    isekaiSkills: [
      { name: "Elbenschwert (Hieb)", level: 8, attribute: "DEX" },
      { name: "Morgenstern", level: 4, attribute: "STR" }
    ]
  }
};

check("Skill verknuepft: Level", weaponSkill(held, { skillName: "Morgenstern" }).level, 4);
check("Gross-/Kleinschreibung egal", weaponSkill(held, { skillName: "  morgenstern " }).level, 4);
check("ohne Verknuepfung: STR", weaponSkill(held, {}).attribute, "STR");
check("unbekannter Skill wird gemeldet", weaponSkill(held, { skillName: "Bogen" }).missing, true);

// STR 6+2=8, halber AW-Skill ceil(5/2)=3, Skill 4, Bonus 3 => 18
check("Schadensbonus mit Skill", damageBonus(held, { skillName: "Morgenstern", bonus: 3 }), 18);
check("Schadensbonus ohne Skill", damageBonus(held, { bonus: 3 }), 14);

// --- Token-Balken: Erweiterung der Attributliste ---
globalThis.CONFIG = { Actor: { trackableAttributes: { character: { bar: ["attributes.hp"], value: [] } } }, Token: {} };
globalThis.TokenDocument = class {
  static getTrackedAttributes(data, path = []) {
    return path.length ? { bar: [], value: [] } : { bar: [["attributes", "hp"]], value: [["details", "xp"]] };
  }
};

const { registerTokenBars } = await import("../scripts/token-bars.js");
registerTokenBars();
registerTokenBars();

const dotted = (result) => result.bar.map(p => p.join("."));
check("Balken ergaenzt", dotted(TokenDocument.getTrackedAttributes()),
  ["attributes.hp", "resources.hp", "resources.mp", "resources.ap"]);
check("keine Dubletten", dotted(TokenDocument.getTrackedAttributes()).length, 4);
check("Rekursion unberuehrt", dotted(TokenDocument.getTrackedAttributes({}, ["resources"])), []);

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
