import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree } from "../scripts/skill-graph.js";
import { COND_LABELS, DAMAGE_TYPES, damageReduction, enrichSkill, nameList, resistanceDR, resistanceSources, derivedStartLevel } from "../scripts/rules.js";
let fails=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);
  if(!ok){fails++;console.log(`FAIL ${n}\n  erwartet ${JSON.stringify(w)}\n  bekommen ${JSON.stringify(g)}`);}
  else console.log(`ok   ${n}`);};

// Machtfaktor: Common 1, Uncommon 2, Rare 4, Epic 8, Legendary 16, Transzendiert 32
check("Rare 15 -> 60", resistanceDR({level:15, rarity:"Rare"}), 60);
check("Epic 10 -> 80", resistanceDR({level:10, rarity:"Epic"}), 80);
check("Common 15 -> 15", resistanceDR({level:15, rarity:"Common"}), 15);
check("Level 0 -> 0", resistanceDR({level:0, rarity:"Legendary"}), 0);

check("Durchschnitt abgerundet", derivedStartLevel([10,10,11]), 10);
check("Durchschnitt exakt", derivedStartLevel([10,12]), 11);
check("ohne Eltern -> 1", derivedStartLevel([]), 1);

// Hookwolf
const hookwolf = damageReduction({ resistances: [
  { name:"Abhärtung", level:15, rarity:"Common", types:[], replaces:[] },
  { name:"Hiebresistenz",  level:10, rarity:"Uncommon", types:["hieb"],  replaces:[] },
  { name:"Stichresistenz", level:10, rarity:"Uncommon", types:["stich"], replaces:[] },
  { name:"Wuchtresistenz", level:10, rarity:"Uncommon", types:["wucht"], replaces:[] },
  { name:"Dicke Haut", level:15, rarity:"Rare", types:["hieb","stich","wucht"],
    replaces:["Hiebresistenz","Stichresistenz","Wuchtresistenz"] },
  { name:"Stahlhaut", level:10, rarity:"Epic", types:["hieb","stich","wucht"], replaces:[] }
]});
check("Hookwolf Hieb = 60 + 80", hookwolf.flat.hieb, 140);
check("Hookwolf Stich", hookwolf.flat.stich, 140);
check("Hookwolf Wucht", hookwolf.flat.wucht, 140);
check("Hookwolf Feuer: keine Deckung", hookwolf.flat.feuer, 0);
check("stillgelegte Skills", hookwolf.retired.sort(), ["hiebresistenz","stichresistenz","wuchtresistenz"]);
check("Abhaertung gibt keine DR", hookwolf.active.some(a=>a.name==="Abhärtung"), false);

// Ruestung mit und ohne Typen
const mitRuestung = damageReduction({ armors: [
  { name:"Panzer", dr:6, durability:20, types:["hieb","wucht"] },
  { name:"Alt", dr:2, durability:5, types:"" },
  { name:"Kaputt", dr:9, durability:0, types:["hieb"] }
]});
check("Ruestung typgenau", mitRuestung.flat.hieb, 8);
check("Ruestung ohne Typen zaehlt ueberall", mitRuestung.flat.feuer, 2);
check("defekte Ruestung zaehlt nicht", mitRuestung.flat.stich, 2);

// Bedingte Resistenz getrennt
const magier = damageReduction({ resistances: [
  { name:"Arkane Resistenz", level:10, rarity:"Epic", types:["feuer","hieb"], cond:"magie", replaces:[] }
]});
check("bedingt nicht in der flachen DR", magier.flat.feuer, 0);
check("bedingt getrennt gefuehrt", magier.conditional.feuer, 80);


// --- Nachfuellen aus dem Skill-Baum -------------------------------------
// Von Hand eingetragene Skills haben keine Schadensarten. Genau das war der
// Grund, warum im Bogen ueberall 0 stand.
const baum = new Map([
  ["abhärtung",      { name:"Abhärtung", types:[], replaces:[], cond:"" }],
  ["hiebresistenz",   { name:"Hiebresistenz", types:["hieb"], replaces:[], cond:"" }],
  ["stichresistenz",  { name:"Stichresistenz", types:["stich"], replaces:[], cond:"" }],
  ["wuchtresistenz",  { name:"Wuchtresistenz", types:["wucht"], replaces:[], cond:"" }],
  ["dicke haut",      { name:"Dicke Haut", types:["hieb","stich","wucht"],
                        replaces:["Hiebresistenz","Stichresistenz","Wuchtresistenz"], cond:"" }],
  ["stahlhaut",       { name:"Stahlhaut", types:["hieb","stich","wucht"], replaces:[], cond:"" }]
]);

check("Schadensart kommt aus dem Baum", enrichSkill({ name:"Hiebresistenz", level:10 }, baum).types, "hieb");
check("Ersetzungen kommen aus dem Baum",
  enrichSkill({ name:"Dicke Haut", level:15 }, baum).replaces,
  "Hiebresistenz,Stichresistenz,Wuchtresistenz");
check("eigene Angabe hat Vorrang",
  enrichSkill({ name:"Hiebresistenz", level:10, types:"feuer" }, baum).types, "feuer");
check("unbekannter Name bleibt unberuehrt",
  enrichSkill({ name:"Eigenbau", level:3, types:"" }, baum).types, "");
check("Namensliste aus Zeichenkette", nameList("Hiebresistenz, Stichresistenz"),
  ["Hiebresistenz","Stichresistenz"]);

// Hookwolf, wie der Spielleiter ihn eingetragen hat: nur Name, Stufe, Level
const handEingetragen = [
  { name:"Abhärtung",      level:15, rarity:"Common",   category:"passiv" },
  { name:"Hiebresistenz",  level:10, rarity:"Uncommon", category:"passiv" },
  { name:"Stichresistenz", level:10, rarity:"Uncommon", category:"passiv" },
  { name:"Wuchtresistenz", level:10, rarity:"Uncommon", category:"passiv" },
  { name:"Dicke Haut",     level:15, rarity:"Rare",     category:"passiv" },
  { name:"Stahlhaut",      level:10, rarity:"Epic",     category:"passiv" }
];
const ausBogen = damageReduction({
  resistances: resistanceSources({ skills: handEingetragen, lookup: baum })
});
check("Bogen ohne eigene Typen: Hieb 140", ausBogen.flat.hieb, 140);
check("Bogen ohne eigene Typen: Wucht 140", ausBogen.flat.wucht, 140);
check("Bogen ohne eigene Typen: Feuer 0", ausBogen.flat.feuer, 0);

// Ruestung zaehlt mit in dieselbe Summe
const mitPanzer = damageReduction({
  armors: [{ name:"Panzer", dr:6, durability:20, types:"hieb,wucht" }],
  resistances: resistanceSources({ skills: handEingetragen, lookup: baum })
});
check("Ruestung plus Resistenz", mitPanzer.flat.hieb, 146);
check("Ruestung deckt Stich nicht", mitPanzer.flat.stich, 140);

// --- Resistenztabelle und Skill-Liste zaehlen nicht doppelt ------------
const beideQuellen = resistanceSources({
  resistances: [{ name:"Feuerschutz", rarity:"Rare", skillName:"Feuerresistenz", types:"feuer" }],
  skills: [{ name:"Feuerresistenz", level:10, rarity:"Common", types:"feuer" }],
  lookup: null
});
check("Tabelle vertritt den Skill", beideQuellen.map(e=>e.name), ["Feuerschutz"]);
check("Level kommt aus dem verknuepften Skill", beideQuellen[0].level, 10);
check("Tabelleneintrag: 10 x 4", damageReduction({ resistances: beideQuellen }).flat.feuer, 40);


// --- Durchstich: echte Baumdaten, Bogen wie der Spielleiter ihn fuehrt ----
// Deckt die ganze Kette ab: data/skill-baum.json -> buildTree -> Nachschlage-
// werk -> resistanceSources -> damageReduction. Genau hier war die Luecke.
const base = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "data/skill-baum.json"), "utf8"));
const echterBaum = buildTree(base, []);
const echtesLookup = new Map(Object.values(echterBaum.skills).map(s => [
  String(s.name).trim().toLowerCase(),
  { ...s, replaces: s.replaces.map(id => echterBaum.skills[id]?.name || id) }
]));

const hookwolfBogen = damageReduction({
  armors: [],
  resistances: resistanceSources({ skills: handEingetragen, lookup: echtesLookup })
});
check("echte Daten: Hookwolf Hieb 140", hookwolfBogen.flat.hieb, 140);
check("echte Daten: Hookwolf Stich 140", hookwolfBogen.flat.stich, 140);
check("echte Daten: Hookwolf Wucht 140", hookwolfBogen.flat.wucht, 140);
check("echte Daten: Hookwolf Feuer 0", hookwolfBogen.flat.feuer, 0);
check("echte Daten: Eltern stillgelegt", hookwolfBogen.retiredLabels.sort(),
  ["Hiebresistenz", "Stichresistenz", "Wuchtresistenz"]);

// Jeder Resistenz-Skill der Daten muss im Baum eine Schadensart behalten
const resistOhneTyp = Object.values(echterBaum.skills)
  .filter(s => s.arch === "resist" && base.skills[s.id]?.types?.length && !s.types.length)
  .map(s => s.name);
check("keine Schadensart verliert sich im Baum", resistOhneTyp, []);


// --- Gift ist eine Schadensart, Krankheit nicht ---------------------------
check("Gift ist eine Schadensart", "gift" in DAMAGE_TYPES, true);
check("Krankheit ist keine", "krankheit" in DAMAGE_TYPES, false);
check("Gift als Quelle gibt es nicht mehr", "gift" in COND_LABELS, false);

const giftSkills = [
  { name: "Giftfestigkeit",        level: 12, rarity: "Common", category: "passiv" },
  { name: "Chemische Immunität",  level: 10, rarity: "Rare",   category: "passiv" }
];
const giftDR = damageReduction({
  resistances: resistanceSources({ skills: giftSkills, lookup: echtesLookup })
});
check("Giftfestigkeit 12 + Chemische Immunitaet 40", giftDR.flat.gift, 52);
check("Chemische Immunitaet deckt auch Saeure", giftDR.flat.saeure, 40);
check("Giftfestigkeit erscheint in der Liste",
  giftDR.active.map(e => e.name).includes("Giftfestigkeit"), true);
check("Saeureresistenz bleibt stillgelegt", giftDR.retiredLabels, ["Säureresistenz"]);

const giftBaum = (name) => echtesLookup.get(name.toLowerCase())?.types || [];
check("Unverwundbarer Koerper: Gift und Saeure", giftBaum("Unverwundbarer Körper").sort(),
  ["gift", "saeure"]);
check("Unverwundbarer Koerper ohne Bedingung",
  echtesLookup.get("unverwundbarer körper").cond, "");
check("Unverwundbar deckt alle zehn", giftBaum("Unverwundbar").length, 10);
check("Urelementar schliesst Gift ein", giftBaum("Urelementar-Unempfindlichkeit").includes("gift"), true);
check("Hiebresistenz bleibt bei einer Art", giftBaum("Hiebresistenz"), ["hieb"]);

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails?1:0);
