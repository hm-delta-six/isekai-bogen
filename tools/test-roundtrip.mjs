// Rundlauf durch den Bogen: rendern -> Formular auslesen -> speichern -> neu
// rendern. Prueft, dass abgeleitete Werte einer Aenderung folgen und dass beim
// Speichern nichts verloren geht.
//
// Deckt den Weg ab, den sonst kein Test beruehrt: _getSubmitData ersetzt beim
// Speichern ganze Listen, und Angriffswert, Schaden und Schadensreduktion
// werden erst beim Zeichnen gerechnet.
//
// Braucht handlebars und jsdom: npm install --no-save handlebars jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");

let Handlebars, JSDOM;
try {
  Handlebars = (await import("handlebars")).default;
  JSDOM = (await import("jsdom")).JSDOM;
} catch {
  console.log("uebersprungen: handlebars oder jsdom fehlt (npm install --no-save handlebars jsdom)");
  process.exit(0);
}

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

// --- Soviel von Foundry, wie der Bogen anfasst ---
const getType = (value) => {
  if (typeof value !== "object") return typeof value;
  if (value === null) return "null";
  if (Array.isArray(value)) return "Array";
  if (!value.constructor || value.constructor.name === "Object") return "Object";
  return value.constructor.name;
};
const expandObject = (flat) => {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    let node = out;
    const parts = key.split(".");
    while (parts.length > 1) {
      const part = parts.shift();
      node[part] = node[part] ?? {};
      node = node[part];
    }
    node[parts[0]] = value;
  }
  return out;
};
// Ein Array wird von einem Objekt ersetzt, nicht verschmolzen — daran gehen
// Felder verloren, die nicht im Formular stehen.
const mergeDeep = (original, other) => {
  for (const [key, value] of Object.entries(other)) {
    if (getType(original[key]) === "Object" && getType(value) === "Object") mergeDeep(original[key], value);
    else original[key] = value;
  }
  return original;
};

globalThis.Application = class { static get defaultOptions() { return {}; } };
globalThis.ActorSheet = class {
  constructor(actor) { this.actor = actor; this.isEditable = true; }
  static get defaultOptions() { return {}; }
  getData() { return { actor: this.actor, cssClass: "" }; }
};
let Sheet = null;
globalThis.Actors = { registerSheet: (_system, cls) => { Sheet = cls; } };
globalThis.Dialog = class { static confirm() {} };
globalThis.Hooks = { once: (hook, fn) => { if (hook === "init") fn(); }, on() {} };
globalThis.mergeObject = (a, b) => ({ ...a, ...b });
globalThis.foundry = {
  utils: {
    mergeObject: globalThis.mergeObject,
    duplicate: value => JSON.parse(JSON.stringify(value)),
    getRoute: path => path,
    getProperty: (obj, path) => path.split(".").reduce((node, key) => node?.[key], obj)
  }
};
globalThis.game = { settings: { register() {}, get() { return []; } }, user: { isGM: true }, i18n: { localize: key => key } };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} }, windows: {} };
globalThis.CONFIG = { Actor: {} };
globalThis.TokenDocument = class {};
globalThis.canvas = {};
globalThis.Roll = class {};
globalThis.ChatMessage = { create() {} };
globalThis.fromUuid = async () => null;

await import(pathToFileURL(join(root, "scripts/custom-sheet.js")).href);

Handlebars.registerHelper("selectOptions", (choices, options) => {
  const selected = options?.hash?.selected;
  return new Handlebars.SafeString(Object.entries(choices || {})
    .map(([key, label]) => `<option value="${key}"${String(key) === String(selected) ? " selected" : ""}>${label}</option>`)
    .join(""));
});
const template = Handlebars.compile(readFileSync(join(root, "templates/sheet.html"), "utf8"));

const actor = {
  name: "Testheld",
  isOwner: true,
  system: {
    abilities: { STR: { value: 10 }, DEX: { value: 14 }, CON: { value: 12 }, INT: { value: 8 }, WIS: { value: 8 }, CHA: { value: 8 } },
    boni: { awSkill: 0, vwSkill: 0, aw: 0, vw: 0, init: 0, armormalus: 0, vwSkillName: "" },
    details: { race: { level: 1, rarity: "Common" }, class: { level: 1, rarity: "Common" } },
    isekai: {}, titles: [], equipment: [], resistances: [],
    // pf1 fuehrt system.skills als Objekt mit festen Schluesseln.
    skills: {
      acr: { rank: 3, cs: true, rt: false, mod: 0 },
      apr: { rank: 0, cs: false, rt: true, mod: 0 },
      blf: { rank: 5, cs: true, rt: false, mod: 0 }
    },
    armors: [{ name: "Weste", dr: 4, durability: 10, types: "stich", wear: "" }],
    isekaiSkills: [
      { name: "Fernkampf", level: 5, rarity: "Common", attribute: "DEX", category: "aktiv", effect: "schiessen" },
      { name: "Pistole", level: 6, rarity: "Rare", attribute: "DEX", category: "aktiv", effect: "zielen" },
      { name: "Ausweichen", level: 8, rarity: "Rare", attribute: "DEX", category: "aktiv", effect: "" },
      { name: "Parade", level: 0, rarity: "Common", attribute: "STR", category: "aktiv", effect: "" },
      { name: "Hiebresistenz", level: 10, rarity: "Uncommon", attribute: "CON", category: "passiv", effect: "", types: "hieb" }
    ],
    weapons: [{
      name: "Pistole", dice: "1d8", rarity: "Uncommon", skillName: "Fernkampf", bonus: 2, dieBonus: 1,
      damageTypes: "stich", areaMode: "single", areaSize: "", description: "Dienstwaffe", mods: []
    }]
  },
  update(data) { mergeDeep(this, expandObject(data)); return Promise.resolve(this); }
};

// Den Skill-Baum laden, wie der Bogen es in Foundry tut: primeTreeLookup
// holt die Datei ueber fetch. Das Nachschlagewerk liefert die Schadensarten
// und die Steigerungen der Skills.
globalThis.fetch = async (path) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(join(root, String(path).replace(/^modules\/isekai-bogen\//, "")), "utf8"))
});
const { primeTreeLookup } = await import("../scripts/skill-tree.js");
await primeTreeLookup();

const sheet = new Sheet(actor);

// Das Formular so auslesen, wie der Browser es an FormDataExtended gibt.
const formular = (html) => {
  const form = new JSDOM(html).window.document.querySelector("form");
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") { data[el.name] = el.checked; continue; }
    data[el.name] = el.type === "number" ? Number(el.value || 0) : el.value;
  }
  return data;
};

const zeichnen = () => {
  const context = sheet.getData();
  return { context, html: template(context), weapon: context.actor.system.weapons[0] };
};

// --- 1. Erstes Zeichnen ---
let runde = zeichnen();
const awVorher = runde.weapon.calculatedAW;
const schadenVorher = runde.weapon.calculatedDamage;
check("Angriffswert steht", typeof awVorher, "number");

// --- 2. Skill der Waffe umstellen und speichern ---
const daten = formular(runde.html);
check("die Auswahlliste der Waffe steht im Formular",
  "system.weapons.0.skillName" in daten, true);
check("sie zeigt den verknuepften Skill", daten["system.weapons.0.skillName"], "Fernkampf");

daten["system.weapons.0.skillName"] = "Pistole";
await actor.update(daten);
runde = zeichnen();

check("der Skill ist gespeichert", runde.weapon.skillName, "Pistole");
check("Angriffswert folgt: Level 5 Common auf 6 Rare, also +1 und +3 Machtfaktor",
  runde.weapon.calculatedAW - awVorher, 4);
check("Schaden folgt mit", runde.weapon.calculatedDamage !== schadenVorher, true);

// --- 3. Speichern ohne Aenderung darf nichts verlieren ---
await actor.update(formular(runde.html));
runde = zeichnen();
const weapon = runde.weapon;
check("Name bleibt", weapon.name, "Pistole");
check("Wuerfel bleibt", weapon.dice, "1d8");
check("Raritaet bleibt", weapon.rarity, "Uncommon");
check("Skill bleibt", weapon.skillName, "Pistole");
check("Bonus bleibt", Number(weapon.bonus), 2);
check("Wuerfelbonus bleibt", Number(weapon.dieBonus), 1);
check("Schadensart bleibt", weapon.damageTypes, "stich");
check("Beschreibung bleibt", weapon.description, "Dienstwaffe");

const skills = runde.context.actor.system.isekaiSkills;
const skillByName = (name) => skills.find(skill => skill.name === name);
check("Skills behalten Namen", skills.map(skill => skill.name),
  ["Fernkampf", "Pistole", "Ausweichen", "Parade", "Hiebresistenz"]);
check("Skills behalten Level", skills.map(skill => Number(skill.level)), [5, 6, 8, 0, 10]);
check("Skills behalten die Raritaet", skills.map(skill => skill.rarity),
  ["Common", "Rare", "Rare", "Common", "Uncommon"]);
check("Skills behalten die Wirkung", skillByName("Fernkampf").effect, "schiessen");
check("Schadensart des Resistenz-Skills bleibt", skillByName("Hiebresistenz").types, "hieb");
check("Ruestung bleibt erhalten", runde.context.actor.system.armors[0].name, "Weste");

// --- 4. Steigerungen aus den Skills ---
// Ausweichen 8 auf Rare steigert den Verteidigungswert um Level x Stufe,
// also 8 x 3 = 24, ohne dass jemand etwas eintragen muss.
check("Verteidigungswert enthaelt die Steigerung: 10 + DEX 14 + 24",
  runde.context.derived.vwTotal, 48);
check("die Hilfe nennt die Quelle",
  runde.context.vwHelp.includes("Ausweichen 24"), true);
const ausweichen = runde.context.actor.system.isekaiSkills.find(skill => skill.name === "Ausweichen");
check("der Skill zeigt, was er steigert", ausweichen.boostText, "+24 Verteidigungswert");

// Der verknuepfte Skill bestimmt nur noch das Attribut: Parade traegt STR 10
// statt DEX 14, ihre eigene Steigerung ist auf Level 0 gleich null.
const vwVorher = runde.context.derived.vwTotal;
const daten2 = formular(runde.html);
check("die Auswahlliste des Abwehr-Skills steht im Formular",
  "system.boni.vwSkillName" in daten2, true);
daten2["system.boni.vwSkillName"] = "Parade";
await actor.update(daten2);
runde = zeichnen();
check("Attribut wechselt zu STR, also 4 weniger",
  runde.context.derived.vwTotal - vwVorher, -4);

// Was nur in einer bestimmten Lage gilt, wird genannt, nicht gerechnet
check("situative Steigerungen bleiben aussen vor",
  runde.context.boostSituational.map(entry => entry.name).includes("Turmschild"), false);

// --- 5. Schadensreduktion ueberlebt das Speichern ---
// Hiebresistenz 10 auf Uncommon: Machtfaktor 2, also 20
check("DR gegen Hieb aus dem Skill", runde.context.drByType.find(entry => entry.label === "Hieb").flat, 20);
check("DR gegen Stich aus der Weste", runde.context.drByType.find(entry => entry.label === "Stich").flat, 4);


// --- pf1s eigene Strukturen bleiben unberuehrt ----------------------------
// system.skills gehoert pf1 und ist dort ein Objekt. Wurde es zu einem Array,
// brach pf1s Datenaufbereitung ab ("Cannot read properties of undefined
// (reading 'push')") und abgeleitete Werte blieben stehen.
const pf1Skills = runde.context.actor.system.skills;
check("system.skills bleibt ein Objekt", Array.isArray(pf1Skills), false);
check("die Schluessel von pf1 bleiben", Object.keys(pf1Skills), ["acr", "apr", "blf"]);
check("die Raenge bleiben", pf1Skills.acr.rank, 3);
check("der Bogen legt dort kein Feld an",
  Object.keys(pf1Skills).every(key => typeof pf1Skills[key] === "object"), true);

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
