import { areaMaximum, areaSetting } from "../scripts/rules.js";
import { templateContains, templateCoverage, templateShape, HIT_COVERAGE } from "../scripts/area.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

// --- Maximale Groesse: Raritaetsstufe x Skill-Level ---
// Rare = Stufe 3, Skill-Level 4
check("Einzelangriff hat keine Groesse", areaMaximum("single", "Rare", 4), null);
check("Markierte Gegner = Skill-Level", areaMaximum("marked", "Rare", 4), 4);
check("Kegel = 3 x 4", areaMaximum("cone", "Rare", 4), 12);
check("Kreis = 3 x 4 / 2 Durchmesser", areaMaximum("circle", "Rare", 4), 6);
check("Linie = 3 x 4 x 2", areaMaximum("line", "Rare", 4), 24);
check("Kreis rundet ab: 3 x 3 / 2", areaMaximum("circle", "Rare", 3), 4);
check("ohne Skill mindestens 1", areaMaximum("cone", "Common", 0), 1);

// --- Verkleinern: -1 AW pro Kaestchen weniger ---
check("leeres Feld = volle Groesse", areaSetting("cone", "Rare", 4, ""), { mode: "cone", max: 12, size: 12, malus: 0 });
check("null = volle Groesse", areaSetting("cone", "Rare", 4, null).size, 12);
check("verkleinert auf 9: Malus 3", areaSetting("cone", "Rare", 4, 9), { mode: "cone", max: 12, size: 9, malus: 3 });
check("groesser als erlaubt wird gekappt", areaSetting("cone", "Rare", 4, 50), { mode: "cone", max: 12, size: 12, malus: 0 });
check("Unsinn = volle Groesse", areaSetting("line", "Rare", 4, "abc").size, 24);
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
const { skillCategory, modBonus, summarizeMods, SKILL_CATEGORIES } = await import("../scripts/rules.js");

check("vier Kategorien", Object.keys(SKILL_CATEGORIES), ["fertigkeit", "aktiv", "modifikation", "passiv"]);
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
const { skillBonus, SKILL_USES_ATTRIBUTE, SKILL_BONUS_FORMULAS } = await import("../scripts/rules.js");

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
  { fertigkeit: true, aktiv: true, modifikation: false, passiv: false });
check("zu jeder Kategorie eine Formel", Object.keys(SKILL_BONUS_FORMULAS),
  ["fertigkeit", "aktiv", "modifikation", "passiv"]);


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

// Zielzahl ist auf die Raritaetsstufe des Skills begrenzt
const cappedTargets = (skill) => Math.min(modBonus(skill), 
  ({ Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Transzendiert: 6 })[skill.rarity] || 1);
check("Rare Level 4: 12 Bonus, aber nur 3 Ziele", cappedTargets({ rarity: "Rare", level: 4 }), 3);
check("Common Level 1: 1 Ziel", cappedTargets({ rarity: "Common", level: 1 }), 1);
check("Level 0 gibt kein Ziel", cappedTargets({ rarity: "Epic", level: 0 }), 0);

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
