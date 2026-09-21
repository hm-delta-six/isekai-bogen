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

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
