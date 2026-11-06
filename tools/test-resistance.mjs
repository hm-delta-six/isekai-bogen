import { damageReduction, resistanceDR, derivedStartLevel } from "../scripts/rules.js";
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

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails?1:0);
