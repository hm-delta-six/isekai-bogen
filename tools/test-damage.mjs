import { resolveDamage, armorState } from "../scripts/damage.js";

const actor = (armors, hp = 100, wear = "highest") => ({
  system: { armors, armorWear: wear, resources: { hp: { value: hp } } }
});

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

// DR summiert sich ueber intakte Teile, defekte zaehlen nicht
const a = actor([
  { name: "Helm", dr: 2, durability: 5 },
  { name: "Panzer", dr: 6, durability: 20 },
  { name: "Schild", dr: 4, durability: 0 }
]);
check("DR-Summe ohne defektes Teil", armorState(a).totalDR, 8);

// Schaden 20, DR 8 -> 12 HP-Verlust, Verschleiss am Panzer (hoechste DR)
const r1 = resolveDamage(a, 20);
check("HP-Verlust", r1.hpLoss, 12);
check("HP danach", r1.hpAfter, 88);
check("Verschleiss hoechste DR", r1.wear, [{ index: 1, wear: 12, from: 20, to: 8 }]);

// Schaden unter DR -> kein HP-Verlust, kein Verschleiss
const r2 = resolveDamage(a, 5);
check("Schaden unter DR: HP", r2.hpLoss, 0);
check("Schaden unter DR: kein Verschleiss", r2.wear, []);

// Verteilte Abnutzung: 7 auf 2 intakte Teile -> 4 und 3
const b = actor([
  { name: "Helm", dr: 2, durability: 5 },
  { name: "Panzer", dr: 6, durability: 20 }
], 100, "spread");
const r3 = resolveDamage(b, 15);
check("verteilt: HP-Verlust", r3.hpLoss, 7);
check("verteilt: Summe stimmt", r3.wear.reduce((s, w) => s + w.wear, 0), 7);
check("verteilt: Aufteilung", r3.wear.map(w => w.wear), [4, 3]);

// Rüstung geht kaputt und wird gemeldet
const c = actor([{ name: "Lederwams", dr: 1, durability: 3 }]);
const r4 = resolveDamage(c, 10);
check("defekt gemeldet", r4.brokenNow, ["Lederwams"]);
check("Haltbarkeit negativ erlaubt", r4.wear[0].to, -6);

// Ohne Rüstung
const d = actor([]);
const r5 = resolveDamage(d, 13);
check("ohne Ruestung: voller Schaden", r5.hpLoss, 13);
check("ohne Ruestung: kein Verschleiss", r5.wear, []);

// HP kann nicht unter 0
const e = actor([], 4);
check("HP-Boden bei 0", resolveDamage(e, 50).hpAfter, 0);


// --- Waffen-Skill aus der Skill-Liste ---
const { weaponSkill } = await import("../scripts/attack.js");

const held = {
  system: {
    isekaiSkills: [
      { name: "Elbenschwert (Hieb)", level: 8, attribute: "DEX" },
      { name: "Faustkampf", level: 3, attribute: "STR" }
    ]
  }
};

check("Skill verknuepft: Level", weaponSkill(held, { skillName: "Elbenschwert (Hieb)" }).level, 8);
check("Skill verknuepft: Attribut", weaponSkill(held, { skillName: "Elbenschwert (Hieb)" }).attribute, "DEX");
check("Gross-/Kleinschreibung egal", weaponSkill(held, { skillName: "  faustkampf " }).level, 3);
check("ohne Verknuepfung: Level 0", weaponSkill(held, { skillName: "" }).level, 0);
check("ohne Verknuepfung: STR", weaponSkill(held, {}).attribute, "STR");
check("unbekannter Skill wird gemeldet", weaponSkill(held, { skillName: "Bogen" }).missing, true);
check("unbekannter Skill zaehlt 0", weaponSkill(held, { skillName: "Bogen" }).level, 0);


// --- Token-Balken: Erweiterung der Attributliste ---
globalThis.CONFIG = { Actor: { trackableAttributes: { character: { bar: ["attributes.hp"], value: [] } } }, Token: {} };
globalThis.TokenDocument = class {
  static getTrackedAttributes(data, path = []) {
    return path.length ? { bar: [], value: [] } : { bar: [["attributes", "hp"]], value: [["details", "xp"]] };
  }
};

const { registerTokenBars } = await import("../scripts/token-bars.js");
registerTokenBars();
registerTokenBars(); // zweimal: darf nichts doppeln

const dotted = (result) => result.bar.map(p => p.join("."));

check("Balken ergaenzt", dotted(TokenDocument.getTrackedAttributes()),
  ["attributes.hp", "resources.hp", "resources.mp", "resources.ap"]);
check("keine Dubletten bei mehrfachem Registrieren",
  dotted(TokenDocument.getTrackedAttributes()).length, 4);
check("Rekursion bleibt unberuehrt",
  dotted(TokenDocument.getTrackedAttributes({}, ["resources"])), []);
check("value-Liste unveraendert",
  TokenDocument.getTrackedAttributes().value.map(p => p.join(".")), ["details.xp"]);
check("Systemliste ergaenzt", CONFIG.Actor.trackableAttributes.character.bar,
  ["attributes.hp", "resources.hp", "resources.mp", "resources.ap"]);

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
