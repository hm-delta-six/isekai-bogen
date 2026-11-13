import { areaMaximum, areaSetting, machtfaktor, machtstufe } from "../scripts/rules.js";
import { templateContains, templateCoverage, templateShape, HIT_COVERAGE } from "../scripts/area.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

// --- Maximale Groesse: Machtstufe der Waffe x Skill-Level ---
// Machtstufe = 2 hoch Raritaetsstufe. Rare = Stufe 3, also Machtstufe 8.
check("Machtstufe Common", machtstufe("Common"), 1);
check("Machtstufe Uncommon", machtstufe("Uncommon"), 2);
check("Machtstufe Rare", machtstufe("Rare"), 4);
check("Machtstufe Epic", machtstufe("Epic"), 8);
check("Machtstufe Legendary", machtstufe("Legendary"), 16);
check("Machtstufe Transzendiert", machtstufe("Transzendiert"), 32);
check("Machtstufe und Machtfaktor sind dieselbe Reihe",
  ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Transzendiert"]
    .every(r => machtstufe(r) === machtfaktor(r)), true);

check("Einzelangriff hat keine Groesse", areaMaximum("single", "Rare", 4), null);
check("Markierte Gegner = Skill-Level", areaMaximum("marked", "Rare", 4), 4);
check("Kegel = 4 x 4", areaMaximum("cone", "Rare", 4), 16);
check("Kreis = 4 x 4 / 2 Durchmesser", areaMaximum("circle", "Rare", 4), 8);
check("Linie = 4 x 4 x 2", areaMaximum("line", "Rare", 4), 32);
check("Kreis rundet ab: 1 x 3 / 2", areaMaximum("circle", "Common", 3), 1);
check("ohne Skill mindestens 1", areaMaximum("cone", "Common", 0), 1);

// --- Verkleinern: -1 AW pro Kaestchen weniger ---
check("leeres Feld = volle Groesse", areaSetting("cone", "Rare", 4, ""), { mode: "cone", max: 16, size: 16, malus: 0 });
check("null = volle Groesse", areaSetting("cone", "Rare", 4, null).size, 16);
check("verkleinert auf 9: Malus 7", areaSetting("cone", "Rare", 4, 9), { mode: "cone", max: 16, size: 9, malus: 7 });
check("groesser als erlaubt wird gekappt", areaSetting("cone", "Rare", 4, 50), { mode: "cone", max: 16, size: 16, malus: 0 });
check("Unsinn = volle Groesse", areaSetting("line", "Rare", 4, "abc").size, 32);
check("weniger Ziele kosten nichts", areaSetting("marked", "Rare", 4, 2), { mode: "marked", max: 4, size: 2, malus: 0 });
check("unbekannter Modus wird Einzelangriff", areaSetting("quatsch", "Rare", 4, 3).mode, "single");

// --- Geometrie: Kreis ---
const circle = { t: "circle", x: 0, y: 0, direction: 0, distance: 100 };
check("Kreis: Mitte drin", templateContains(circle, 0, 0), true);
check("Kreis: Rand drin", templateContains(circle, 100, 0), true);
check("Kreis: knapp draussen", templateContains(circle, 71, 71), false);

// --- Geometrie: Kegel nach rechts, 53 Grad ---
const cone = { t: "cone", x: 0, y: 0, direction: 0, distance: 100, angle: 53 };
check("Kegel: geradeaus drin", templateContains(cone, 50, 0), true);
check("Kegel: 20 Grad seitlich drin", templateContains(cone, 50, 18), true);
check("Kegel: 45 Grad seitlich draussen", templateContains(cone, 50, 50), false);
check("Kegel: hinter dem Ursprung draussen", templateContains(cone, -10, 0), false);
check("Kegel: zu weit", templateContains(cone, 110, 0), false);

const coneDown = { ...cone, direction: 90 };
check("Kegel nach unten gedreht", templateContains(coneDown, 0, 50), true);
check("gedrehter Kegel trifft rechts nicht", templateContains(coneDown, 50, 0), false);

const coneWrap = { ...cone, direction: 350 };
check("Kegel ueber 0 Grad hinweg", templateContains(coneWrap, 50, 5), true);

// --- Geometrie: Linie nach rechts, 20 breit ---
const ray = { t: "ray", x: 0, y: 0, direction: 0, distance: 200, width: 20 };
check("Linie: auf der Achse", templateContains(ray, 100, 0), true);
check("Linie: am Rand der Breite", templateContains(ray, 100, 10), true);
check("Linie: neben der Breite", templateContains(ray, 100, 11), false);
check("Linie: hinter dem Start", templateContains(ray, -5, 0), false);
check("Linie: hinter dem Ende", templateContains(ray, 201, 0), false);

// --- Ueberlappung: mindestens zur Haelfte ---
const square = { x: 0, y: 0, w: 100, h: 100 };
const halfPlane = { t: "ray", x: 0, y: 50, direction: 0, distance: 1000, width: 1000 };
check("Token ganz drin = 1", templateCoverage(halfPlane, square), 1);

// Linie 100 breit, mittig durch die obere Haelfte des Tokens: y 0..50 -> Anteil 0,5
const topHalf = { t: "ray", x: -10, y: 0, direction: 0, distance: 1000, width: 100 };
check("obere Haelfte bedeckt = 0,5", templateCoverage(topHalf, square), 0.5);
check("genau die Haelfte zaehlt als Treffer", templateCoverage(topHalf, square) >= HIT_COVERAGE, true);

const sliver = { t: "ray", x: -10, y: 0, direction: 0, distance: 1000, width: 40 };
check("nur ein Streifen = kein Treffer", templateCoverage(sliver, square) >= HIT_COVERAGE, false);

const far = { t: "circle", x: 500, y: 500, direction: 0, distance: 50 };
check("weit weg = 0", templateCoverage(far, square), 0);

// --- Umrechnung Kaestchen -> Foundry-Einheiten und Pixel (1,5 m, 100 px) ---
const coneShape = templateShape("cone", 12, 1.5, 100);
check("Kegel: Laenge in Metern", coneShape.units, 18);
check("Kegel: Laenge in Pixeln", coneShape.pixels, 1200);
check("Kegel: 53 Grad", coneShape.angle, 53);

const circleShape = templateShape("circle", 6, 1.5, 100);
check("Kreis: Durchmesser 6 -> Radius 3 Kaestchen", circleShape.squares, 3);
check("Kreis: Radius in Metern", circleShape.units, 4.5);

const lineShape = templateShape("line", 24, 5, 100);
check("Linie wird Foundry-Typ ray", lineShape.t, "ray");
check("Linie: 1 Kaestchen breit in Fuss", lineShape.width.units, 5);
check("Linie: Laenge in Fuss", lineShape.units, 120);

check("Einzelangriff hat keine Form", templateShape("single", 5, 1.5, 100), null);


// --- Skill-Kategorien und Modifikations-Skills ---
const { skillCategory, modBonus, summarizeMods, targetMalus, defenceSkill, boostAmount, boostTotals, SKILL_CATEGORY_HINTS,
  skillBoosts, BOOST_TARGETS, BOOST_FORMULAS, SKILL_CATEGORIES } = await import("../scripts/rules.js");

const KATEGORIEN = ["fertigkeit", "aktiv", "modifikation", "passiv", "resistenz"];
check("fuenf Kategorien", Object.keys(SKILL_CATEGORIES), KATEGORIEN);
check("ohne Angabe: Fertigkeit", skillCategory({ name: "Alt" }), "fertigkeit");
check("unbekannte Kategorie faellt zurueck", skillCategory({ category: "quatsch" }), "fertigkeit");
check("gueltige Kategorie bleibt", skillCategory({ category: "passiv" }), "passiv");

// Bonushoehe = Raritaetsstufe x Skill-Level
check("Rare 4 -> 12", modBonus({ rarity: "Rare", level: 4 }), 12);
check("Common 0 -> 0", modBonus({ rarity: "Common", level: 0 }), 0);
check("negatives Level zaehlt 0", modBonus({ rarity: "Epic", level: -3 }), 0);

const summary = summarizeMods([
  { bonusType: "aw", bonus: 6, costType: "mp", costValue: 3 },
  { bonusType: "aw", bonus: 4, costType: "mp", costValue: 2 },
  { bonusType: "damage", bonus: 8, costType: "ap", costValue: 1 },
  { bonusType: "targets", bonus: 2, costType: "hp", costValue: 5 }
]);
check("AW summiert", summary.bonus.aw, 10);
check("Schaden summiert", summary.bonus.damage, 8);
check("Anzahl Gegner summiert", summary.bonus.targets, 2);
check("Reichweite ohne Eintrag", summary.bonus.range, 0);
check("MP-Kosten summiert", summary.cost.mp, 5);
check("AP-Kosten summiert", summary.cost.ap, 1);
check("HP-Kosten summiert", summary.cost.hp, 5);
check("leere Liste", summarizeMods([]).cost, { hp: 0, mp: 0, ap: 0 });
check("unbekannter Bonustyp wird ignoriert", summarizeMods([{ bonusType: "quatsch", bonus: 9 }]).bonus.aw, 0);


// --- Bonusformeln je Skill-Kategorie ---
const { skillBonus, bonusFormula, CATEGORY_BONUS_FORMULA, SKILL_USES_ATTRIBUTE, SKILL_BONUS_FORMULAS } = await import("../scripts/rules.js");

// Rare = Stufe 3, Level 4, Attribut 7
const rare4 = { rarity: "Rare", level: 4 };
check("Fertigkeit: 4 x 3 + 7", skillBonus({ ...rare4, category: "fertigkeit" }, 7), 19);
check("ohne Kategorie wie Fertigkeit", skillBonus(rare4, 7), 19);
check("Aktiv: 4 + floor(7/2)", skillBonus({ ...rare4, category: "aktiv" }, 7), 7);
check("Aktiv rundet ab", skillBonus({ ...rare4, category: "aktiv" }, 9), 8);
check("Modifikation: 4 x 3, Attribut egal", skillBonus({ ...rare4, category: "modifikation" }, 7), 12);
check("Passiv: 4 x 3 / 2", skillBonus({ ...rare4, category: "passiv" }, 7), 6);
check("Passiv rundet ab", skillBonus({ rarity: "Rare", level: 3, category: "passiv" }, 7), 4);
check("Level 0 Fertigkeit: nur Attribut", skillBonus({ ...rare4, level: 0, category: "fertigkeit" }, 7), 7);
check("negatives Level zaehlt 0", skillBonus({ ...rare4, level: -5, category: "fertigkeit" }, 7), 7);

check("Attribut nur bei Fertigkeit und Aktiv", SKILL_USES_ATTRIBUTE,
  { fertigkeit: true, aktiv: true, modifikation: false, passiv: false, resistenz: false });
check("zu jeder Kategorie eine Formel", Object.keys(SKILL_BONUS_FORMULAS), KATEGORIEN);
check("zu jeder Kategorie ein Hinweis", Object.keys(SKILL_CATEGORY_HINTS), KATEGORIEN);

// Bei einer Resistenz ist der Bonus die Schadensreduktion
check("Resistenz 15 Rare: 15 x 4", skillBonus({ level: 15, rarity: "Rare", category: "resistenz" }, 99), 60);


// --- Ziel-Bonus schaltet Einzelangriff auf mehrere Ziele um ---
// Nachbau der Verzweigung aus resolveAttack, damit die Regel geprueft bleibt.
const areaWithBonus = (base, bonus) => {
  if (bonus.targets > 0) {
    return base.mode === "single"
      ? { ...base, mode: "marked", max: 1 + bonus.targets, size: 1 + bonus.targets }
      : { ...base, size: base.size + bonus.targets };
  }
  if (base.size !== null) return { ...base, size: base.size + bonus.range };
  return { ...base };
};

const einzel = { mode: "single", max: null, size: null, malus: 0 };
const keiner = { aw: 0, damage: 0, targets: 0, range: 0 };

check("Einzelangriff ohne Bonus bleibt einzeln", areaWithBonus(einzel, keiner).mode, "single");
check("Rundumschlag macht daraus markierte Gegner",
  areaWithBonus(einzel, { ...keiner, targets: 3 }).mode, "marked");
check("Rundumschlag: eigenes Ziel plus Bonus",
  areaWithBonus(einzel, { ...keiner, targets: 3 }).size, 4);
check("bei markierten Gegnern wird addiert",
  areaWithBonus({ mode: "marked", max: 4, size: 4, malus: 0 }, { ...keiner, targets: 2 }).size, 6);
check("Reichweite vergroessert den Kegel",
  areaWithBonus({ mode: "cone", max: 12, size: 12, malus: 0 }, { ...keiner, range: 5 }).size, 17);
check("Reichweite laesst den Einzelangriff in Ruhe",
  areaWithBonus(einzel, { ...keiner, range: 5 }).mode, "single");

// Zielzahl ist Skill-Level x Raritaetsstufe, ohne Deckel; bezahlt wird mit AW
check("Rare Level 4: 12 Ziele", modBonus({ rarity: "Rare", level: 4 }), 12);
check("Common Level 1: 1 Ziel", modBonus({ rarity: "Common", level: 1 }), 1);
check("Level 0 gibt kein Ziel", modBonus({ rarity: "Epic", level: 0 }), 0);

check("Common kostet 5 AW",        targetMalus({ rarity: "Common" }), 5);
check("Uncommon kostet 4 AW",      targetMalus({ rarity: "Uncommon" }), 4);
check("Rare kostet 3 AW",          targetMalus({ rarity: "Rare" }), 3);
check("Epic kostet 2 AW",          targetMalus({ rarity: "Epic" }), 2);
check("Legendary kostet 1 AW",     targetMalus({ rarity: "Legendary" }), 1);
check("Transzendiert kostet nichts", targetMalus({ rarity: "Transzendiert" }), 0);

// Der Malus steckt in der Zusammenfassung, nicht im Bonus
const rundumschlag = [{ bonusType: "targets", bonus: 12, awMalus: 3, costType: "ap", costValue: 5 }];
check("Zielbonus bleibt voll", summarizeMods(rundumschlag).bonus.targets, 12);
check("AW-Malus summiert", summarizeMods(rundumschlag).malus, 3);
check("zwei Mods addieren den Malus",
  summarizeMods([...rundumschlag, { bonusType: "targets", bonus: 4, awMalus: 5 }]).malus, 8);
check("ohne Zielbonus kein Malus",
  summarizeMods([{ bonusType: "aw", bonus: 6, awMalus: 0 }]).malus, 0);


// --- Abwehr-Skill hinter dem Verteidigungswert ----------------------------
// Ausweichen rechnet mit DEX, Parade mit STR — so steht es in den Baumdaten.
const bogenSkills = [
  { name: "Ausweichen", level: 8, rarity: "Rare",   attribute: "DEX", category: "aktiv",
    boosts: [{ t: "vw" }] },
  { name: "Parade",     level: 5, rarity: "Common", attribute: "STR", category: "aktiv",
    boosts: [{ t: "vw" }] }
];
// Der staerkste Abwehr-Skill traegt das Attribut, nichts auszuwaehlen.
check("Ausweichen 8 Rare traegt DEX", defenceSkill(bogenSkills).attribute, "DEX");
check("und sein Beitrag ist 8 x 3", defenceSkill(bogenSkills).amount, 24);
check("es ist Ausweichen, nicht Parade", defenceSkill(bogenSkills).name, "Ausweichen");
check("nur Parade: STR", defenceSkill([bogenSkills[1]]).attribute, "STR");
check("ohne Abwehr-Skill: DEX", defenceSkill([]).attribute, "DEX");
check("und dann ohne Beitrag", defenceSkill([]).amount, 0);
check("ein Skill ohne Steigerung zaehlt nicht",
  defenceSkill([{ name: "Kochkunst", level: 20, rarity: "Epic", attribute: "INT" }]).name, null);
check("eine Steigerung mit Lage traegt das Attribut nicht",
  defenceSkill([{ name: "Turmschild", level: 9, rarity: "Epic", attribute: "STR",
    boosts: [{ t: "vw", s: "von vorn" }] }]).attribute, "DEX");


// --- Steigerungen: welchen Wert ein Skill hebt ----------------------------
// Grundregel ohne eigene Angabe: Skill-Level x Raritaetsstufe.
const ausweichen = { name: "Ausweichen", level: 8, rarity: "Rare", boosts: [{ t: "vw" }] };
check("Standard: 8 x 3", boostAmount(ausweichen), 24);
check("halbiert: 8 x 3 / 2", boostAmount(ausweichen, "half"), 12);
check("Machtfaktor: 8 x 4", boostAmount(ausweichen, "factor"), 32);
check("nur das Level", boostAmount(ausweichen, "level"), 8);
check("Fuenftel, abgerundet", boostAmount({ level: 12, rarity: "Common" }, "fifth"), 2);
check("unbekannte Regel faellt auf Standard", boostAmount(ausweichen, "quatsch"), 24);
check("Level 0 steigert nichts", boostAmount({ level: 0, rarity: "Epic" }), 0);

check("ein Ziel wird gelesen", skillBoosts(ausweichen).map(b => b.target), ["vw"]);
check("unbekanntes Ziel fliegt raus",
  skillBoosts({ level: 5, rarity: "Rare", boosts: [{ t: "quatsch" }] }), []);
check("Ruestungsmalus senkt",
  skillBoosts({ level: 10, rarity: "Common", boosts: [{ t: "armormalus", f: "fifth" }] })[0].lowers, true);

const vorausahnung = { name: "Vorausahnung", level: 10, rarity: "Rare",
  boosts: [{ t: "vw", f: "half" }, { t: "init", f: "half" }] };
const turmschild = { name: "Turmschild", level: 4, rarity: "Common",
  boosts: [{ t: "vw", s: "gegen Angriffe von vorn" }] };
const summe = boostTotals([ausweichen, vorausahnung, turmschild]);
check("VW summiert: 24 + 15", summe.totals.vw, 39);
check("Initiative: 15", summe.totals.init, 15);
check("Quellen werden genannt", summe.sources.vw.map(e => e.name), ["Ausweichen", "Vorausahnung"]);
check("situative Steigerung nicht in der Summe",
  summe.sources.vw.some(e => e.name === "Turmschild"), false);
check("sie wird aber gefuehrt", summe.situational.map(e => e.name), ["Turmschild"]);
check("ohne Skills bleibt alles 0", boostTotals([]).totals.vw, 0);
check("zu jedem Ziel eine Beschriftung",
  Object.keys(BOOST_TARGETS).every(key => Boolean(BOOST_TARGETS[key])), true);
check("Standard-Rechenregel ist benannt", Boolean(BOOST_FORMULAS.standard), true);


// --- Rechenregel je Skill ------------------------------------------------
// Ohne Angabe gilt die Regel der Kategorie; ein Skill kann abweichen.
const fert = { level: 10, rarity: "Rare", category: "fertigkeit" };
check("Fertigkeit: Level x Stufe + Attribut", skillBonus(fert, 5), 35);
check("mit Machtstufe: Level x 4 + Attribut",
  skillBonus({ ...fert, bonusMode: "factor" }, 5), 45);
check("nur das Level + Attribut",
  skillBonus({ ...fert, bonusMode: "level" }, 5), 15);
check("halbiert + Attribut", skillBonus({ ...fert, bonusMode: "half" }, 5), 20);
check("unbekannte Angabe faellt auf die Kategorie zurueck",
  skillBonus({ ...fert, bonusMode: "quatsch" }, 5), 35);

// Die alten Schreibweisen aus der Zeit mit zwei Listen gelten weiter
check("alt: rank ist standard", skillBonus({ ...fert, bonusMode: "rank" }, 5), 35);
check("alt: none ist level", skillBonus({ ...fert, bonusMode: "none" }, 5), 15);

const passiv = { level: 10, rarity: "Rare", category: "passiv" };
check("Passiv: Level x Stufe / 2", skillBonus(passiv), 15);
check("Passiv mit Machtstufe: Level x 4",
  skillBonus({ ...passiv, bonusMode: "factor" }, 0), 40);

check("Aktiv rechnet von sich aus ohne Faktor",
  skillBonus({ level: 10, rarity: "Transzendiert", category: "aktiv" }, 8), 14);
check("Resistenz rechnet von sich aus mit der Machtstufe",
  skillBonus({ level: 10, rarity: "Rare", category: "resistenz" }), 40);
check("Resistenz kann auf die Stufe umgestellt werden",
  skillBonus({ level: 10, rarity: "Rare", category: "resistenz", bonusMode: "standard" }), 30);

// Eine Liste von Rechenregeln, nicht zwei: der eigene Bonus und eine
// Steigerung benutzen dieselben Schluessel.
check("zu jeder Kategorie eine Standardregel",
  Object.keys(CATEGORY_BONUS_FORMULA), KATEGORIEN);
check("alle Standardregeln sind bekannte Rechenregeln",
  Object.values(CATEGORY_BONUS_FORMULA).every(regel => regel in BOOST_FORMULAS), true);
check("ohne Angabe die Regel der Kategorie",
  bonusFormula({ category: "passiv" }), "half");
check("mit Angabe die eigene", bonusFormula({ category: "passiv", bonusMode: "factor" }), "factor");

// --- Steigerung auf Skill-Proben -----------------------------------------
check("Skill-Proben sind ein Ziel", "check" in BOOST_TARGETS, true);
const kundig = { name: "Gelehrsamkeit", level: 6, rarity: "Uncommon", boosts: [{ t: "check" }] };
check("Steigerung auf Proben: 6 x 2", boostTotals([kundig]).totals.check, 12);
check("und wird als Quelle genannt",
  boostTotals([kundig]).sources.check.map(e => e.name), ["Gelehrsamkeit"]);


// Der angezeigte Formeltext je Kategorie muss zu der Regel passen, mit der
// gerechnet wird — sonst steht im Bogen etwas anderes als herauskommt.
const attributZusatz = {
  fertigkeit: " + Attribut",
  aktiv: " + halber Attributswert (abgerundet)",
  modifikation: "", passiv: "", resistenz: ""
};
for (const kategorie of KATEGORIEN) {
  const regel = BOOST_FORMULAS[CATEGORY_BONUS_FORMULA[kategorie]];
  const text = SKILL_BONUS_FORMULAS[kategorie];
  const beginnt = text.startsWith(regel.split(" (")[0].replace(" ÷ ", " / "))
    || text.startsWith(regel);
  check(`Formeltext passt zur Regel: ${kategorie}`, beginnt, true);
  check(`Attributsteil genannt: ${kategorie}`,
    attributZusatz[kategorie] === "" || text.includes("Attribut"), true);
}


// --- Ruestungsmalus: angelegte DR minus Staerke --------------------------
const { armorMalus, isWorn } = await import("../scripts/rules.js");
const traeger = (armors, str = 10, boni = {}) => ({
  abilities: { STR: { value: str } }, boni, titles: [], equipment: [], armors
});

check("ohne Ruestung kein Malus", armorMalus(traeger([])).wert, 0);
check("leichte Ruestung traegt sich muehelos",
  armorMalus(traeger([{ dr: 8, durability: 10 }])).wert, 0);
check("18 DR minus STR 10", armorMalus(traeger([{ dr: 18, durability: 10 }])).wert, 8);
check("mehrere Teile summieren sich",
  armorMalus(traeger([{ dr: 10, durability: 5 }, { dr: 8, durability: 5 }])).wert, 8);
check("staerkere Leute tragen leichter",
  armorMalus(traeger([{ dr: 18, durability: 10 }], 16)).wert, 2);

check("abgelegtes zaehlt nicht",
  armorMalus(traeger([{ dr: 18, durability: 10, worn: false }])).wert, 0);
check("kaputtes zaehlt nicht",
  armorMalus(traeger([{ dr: 18, durability: 0 }])).wert, 0);
check("ohne Angabe gilt es als angelegt", isWorn({ dr: 5, durability: 5 }), true);

check("das Extra-Feld kommt dazu",
  armorMalus(traeger([{ dr: 18, durability: 10 }], 10, { armormalus: 3 })).wert, 11);

const traegerSkill = [{ name: "Rüstungstragen", level: 10, rarity: "Common",
  boosts: [{ t: "armormalus", f: "fifth" }] }];
check("Ruestungstragen senkt um Level durch 5",
  armorMalus(traeger([{ dr: 18, durability: 10 }]), traegerSkill).wert, 6);
check("der Malus wird nie negativ",
  armorMalus(traeger([{ dr: 11, durability: 10 }]), traegerSkill).wert, 0);

// Resistenzen wiegen nichts
check("Resistenzen machen keinen Malus",
  armorMalus({ ...traeger([]), resistances: [{ name: "Feuerschutz", rarity: "Rare" }] }).wert, 0);

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
