// Reine Logik des Skill-Baums, ohne Foundry-Zugriff (testbar mit Node).
//
// Der mitgelieferte Baum liegt in data/skill-baum.json. Eigene Skills
// speichert der Spielleiter als Weltdaten; buildTree() setzt beides zu einem
// Baum zusammen, in dem Kinder, Art und Einstiegsrarität berechnet sind.

import {
  BOOST_FORMULAS, BOOST_TARGETS, SKILL_CATEGORIES, derivedStartLevel, nameList, toArray, typeList
} from "./rules.js";

export const MAX_LEVEL = 7;

// Rarität, ab der ein Skill der Ebene existiert (Raritätsstufe 1–6)
export const LEVEL_FLOOR = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };

// Level, das jeder Elternskill haben muss, bevor der Skill der Ebene lernbar ist
export const LEVEL_REQ = { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20, 6: 30, 7: 40 };

export const RARITY_LETTERS = ["C", "U", "R", "E", "L", "T"];

const RARITY_ALIASES = {
  c: 0, common: 0,
  u: 1, uncommon: 1,
  r: 2, rare: 2, selten: 2,
  e: 3, epic: 3, episch: 3,
  l: 4, legendary: 4, legendaer: 4, "legendär": 4,
  t: 5, transzendiert: 5
};

// Skill-Typ im Baum -> Kategorie im Bogen
export const TYPE_CATEGORY = { F: "fertigkeit", A: "aktiv", M: "modifikation", P: "passiv" };

export const TYPE_LABELS = {
  F: "Fertigkeit", A: "Aktiver Skill", M: "Angriffs-Modifikation", P: "Passiver Skill"
};

export const ATTRIBUTES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

const norm = (text) => String(text ?? "").trim().toLowerCase();

/** Art des Skills, bestimmt die Staffel nach Rarität. */
export function archetype(domain, type) {
  switch (domain) {
    case "waffen": return "waffe";
    case "verteidigung": return "abwehr";
    case "spezial": return "mod";
    case "magie":
    case "kombi": return type === "P" ? "passiv" : "zauber";
    case "wissen": return "wissen";
    case "herstellung": return "handwerk";
    case "resistenz": return "resist";
    default: return "probe";
  }
}

/** "Rare: Text" je Zeile -> { R: "Text" }. Unbekannte Zeilen werden übergangen. */
export function parseMilestones(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-zÄÖÜäöü]+)\s*[:\-–]\s*(.+?)\s*$/);
    if (!match) continue;
    const index = RARITY_ALIASES[match[1].toLowerCase()];
    if (index === undefined) continue;
    out[RARITY_LETTERS[index]] = match[2];
  }
  return out;
}

export function formatMilestones(ms, rn) {
  return RARITY_LETTERS
    .filter(letter => ms?.[letter])
    .map(letter => `${rn[RARITY_LETTERS.indexOf(letter)]}: ${ms[letter]}`)
    .join("\n");
}

const shape = (skill, base) => ({
  id: skill.id,
  name: skill.name,
  domain: skill.domain,
  parents: [...(skill.parents || [])],
  attr: skill.attr,
  type: skill.type,
  res: skill.res || "",
  level: skill.level,
  kern: skill.kern || "",
  ms: { ...(skill.ms || {}) },
  // In welche Tabelle des Bogens der Skill gehoert. Steht am Skill, damit
  // Resistenzen nicht an ihrem Typ erraten werden muessen: sie sind passive
  // Skills und haetten sonst in derselben Tabelle gelandet.
  cat: skill.cat in SKILL_CATEGORIES ? skill.cat : "",
  // Resistenzangaben. Fehlten hier, womit sie aus den Baumdaten nie in den
  // Baum und damit auch nie in den Bogen gelangt sind — die Schadens-
  // reduktion blieb deshalb auf 0.
  types: typeList(skill.types),
  replaces: nameList(skill.replaces),
  cond: skill.cond || "",
  // Welche Werte der Skill steigert. Steht nur im Baum, nicht im Bogen: der
  // Bogen schlaegt es beim Namen nach, damit es nicht in jedem Charakter
  // mitgepflegt werden muss.
  boosts: toArray(skill.boosts).filter(entry => entry && entry.t).map(entry => ({ ...entry })),
  custom: !base,
  children: []
});

/**
 * Baum aus Basisdaten und eigenen Skills. Berechnet Kinder, Art, Einstiegs-
 * rarität und Typ der Ableitung neu. Eigene Skills mit unbekannten Eltern
 * verlieren diese Eltern stillschweigend, damit der Baum immer ladbar bleibt.
 */
export function buildTree(base, customs = []) {
  const rn = base.rn;
  const skills = {};

  for (const id of base.order) {
    const source = base.skills[id];
    skills[id] = { ...shape(source, true), arch: source.arch, fl: source.fl, floor: source.floor };
  }

  const order = [...base.order];
  const sortedCustoms = [...customs].sort((a, b) =>
    (a.level - b.level) || String(a.name).localeCompare(String(b.name), "de"));

  for (const custom of sortedCustoms) {
    if (!custom?.id || skills[custom.id]) continue;
    const level = Math.min(MAX_LEVEL, Math.max(1, Math.trunc(Number(custom.level)) || 1));
    const entry = shape({ ...custom, level }, false);
    entry.domain = base.doms.includes(custom.domain) ? custom.domain : "allgemein";
    entry.type = custom.type in TYPE_CATEGORY ? custom.type : "F";
    entry.attr = ATTRIBUTES.includes(custom.attr) ? custom.attr : "STR";
    entry.arch = archetype(entry.domain, entry.type);
    entry.fl = LEVEL_FLOOR[level];
    entry.floor = rn[entry.fl - 1];
    skills[custom.id] = entry;
    order.push(custom.id);
  }

  for (const id of order) {
    const skill = skills[id];
    skill.parents = skill.parents.filter(parent => skills[parent] && parent !== id);
    skill.kind = !skill.parents.length ? "Wurzel" : skill.parents.length === 1 ? "Ableitung" : "Verschmelzung";
  }
  for (const id of order) {
    for (const parent of skills[id].parents) skills[parent].children.push(id);
  }

  return { skills, order, rn, doms: base.doms, lad: base.lad };
}

function closure(tree, id, key) {
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const current = tree.skills[stack.pop()];
    for (const next of current?.[key] || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/** Alle Vorstufen (Eltern, deren Eltern, ...). */
export const ancestors = (tree, id) => closure(tree, id, "parents");

/** Alle Skills, die auf diesem aufbauen. */
export const descendants = (tree, id) => closure(tree, id, "children");

/**
 * Prüft einen eigenen Skill. `selfId` ist gesetzt, wenn ein bestehender
 * bearbeitet wird. Liefert Fehler (Speichern blockiert) und Hinweise.
 */
export function validateCustom(tree, input, selfId = null) {
  const errors = [];
  const warnings = [];

  const name = String(input?.name ?? "").trim();
  if (name.length < 2) errors.push("Der Name ist zu kurz.");
  if (name.length > 60) errors.push("Der Name ist länger als 60 Zeichen.");
  const duplicate = Object.values(tree.skills).find(skill =>
    skill.id !== selfId && norm(skill.name) === norm(name));
  if (name && duplicate) errors.push(`Einen Skill „${duplicate.name}“ gibt es schon.`);

  const level = Number(input?.level);
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    errors.push(`Die Ebene muss eine ganze Zahl von 1 bis ${MAX_LEVEL} sein.`);
  }

  if (!tree.doms.includes(input?.domain)) errors.push("Der Bereich ist unbekannt.");
  if (!(input?.type in TYPE_CATEGORY)) errors.push("Der Typ ist unbekannt.");
  if (!ATTRIBUTES.includes(input?.attr)) errors.push("Das Attribut ist unbekannt.");

  const parents = [...new Set(input?.parents || [])];
  const known = parents.filter(parent => tree.skills[parent]);
  if (known.length !== parents.length) errors.push("Ein gewählter Elternskill existiert nicht mehr.");
  if (selfId && parents.includes(selfId)) errors.push("Ein Skill kann nicht sein eigener Elternskill sein.");

  if (Number.isInteger(level)) {
    if (level === 1 && known.length) errors.push("Ebene 1 hat keine Elternskills.");
    if (level > 1 && !known.length) errors.push("Ab Ebene 2 braucht ein Skill mindestens einen Elternskill.");

    for (const parent of known) {
      const parentSkill = tree.skills[parent];
      if (parentSkill.level >= level) {
        errors.push(`„${parentSkill.name}“ (Ebene ${parentSkill.level}) steht nicht unter Ebene ${level}.`);
      }
      if (selfId && descendants(tree, selfId).has(parent)) {
        errors.push(`„${parentSkill.name}“ baut selbst auf diesem Skill auf.`);
      }
    }

    if (selfId) {
      for (const childId of tree.skills[selfId]?.children || []) {
        const child = tree.skills[childId];
        if (child.level <= level) {
          errors.push(`„${child.name}“ (Ebene ${child.level}) baut auf diesem Skill auf und muss höher stehen.`);
        }
      }
    }

    const deepest = Math.max(0, ...known.map(parent => tree.skills[parent].level));
    if (known.length && level > deepest + 1) {
      warnings.push(`Der tiefste Elternskill steht auf Ebene ${deepest}. Nach der Grundregel läge der Skill auf Ebene ${deepest + 1}.`);
    }
  }

  // Stilllegen darf ein Skill nur seine eigenen Eltern. Sonst verschwaende
  // ein Eintrag Werte an beliebiger Stelle im Baum.
  for (const id of [...new Set(input?.replaces || [])]) {
    const target = tree.skills[id];
    if (!target) { errors.push("Ein stillzulegender Skill existiert nicht mehr."); continue; }
    if (!parents.includes(id)) {
      errors.push(`„${target.name}“ kann nicht stillgelegt werden: der Skill ist kein Elternteil.`);
    }
  }

  // Nur passive Skills tragen Schadensarten; bei allen anderen haette das
  // Feld keine Wirkung und wuerde Erwartungen wecken.
  const types = [...new Set(input?.types || [])];
  if (types.length && input?.type !== "P") {
    errors.push("Schadensarten gibt es nur bei passiven Skills.");
  }
  if (input?.cond && !types.length) {
    warnings.push("Eine Bedingung ohne Schadensart bleibt wirkungslos.");
  }

  return { errors, warnings };
}

/** Fertiger eigener Skill aus den Formulardaten. */
export function makeCustomSkill(input, id) {
  const ms = typeof input.ms === "string" ? parseMilestones(input.ms) : { ...(input.ms || {}) };
  return {
    id,
    name: String(input.name).trim(),
    domain: input.domain,
    parents: [...new Set(input.parents || [])],
    attr: input.attr,
    type: input.type,
    res: input.res === "AP" || input.res === "MP" ? input.res : "",
    level: Number(input.level),
    kern: String(input.kern || "").trim(),
    // Nur passive Skills reduzieren Schaden; der Rest bleibt leer.
    types: input.type === "P" ? [...new Set(input.types || [])] : [],
    replaces: [...new Set(input.replaces || [])],
    cond: input.type === "P" ? String(input.cond || "").trim() : "",
    cat: input.cat in SKILL_CATEGORIES ? input.cat : "",
    // Welche Werte der Skill steigert. Ohne eigene Rechenregel gilt
    // Skill-Level x Raritaetsstufe.
    boosts: toArray(input.boosts)
      .filter(entry => entry?.t in BOOST_TARGETS)
      .map(entry => {
        const boost = { t: entry.t };
        if (entry.f in BOOST_FORMULAS && entry.f !== "standard") boost.f = entry.f;
        if (String(entry.s || "").trim()) boost.s = String(entry.s).trim();
        return boost;
      }),
    ms
  };
}

/**
 * Wirkung je Rarität ab der Einstiegsrarität: die Staffel der Art plus, falls
 * vorhanden, das Besondere dieses Skills.
 */
export function effectLines(tree, id) {
  const skill = tree.skills[id];
  if (!skill) return [];

  const ladder = tree.lad[skill.arch] || [];
  const lines = [];
  for (let rank = skill.fl; rank <= 6; rank++) {
    lines.push({
      rank,
      rarity: tree.rn[rank - 1],
      base: ladder[rank - 1] || "",
      extra: skill.ms[RARITY_LETTERS[rank - 1]] || null
    });
  }
  return lines;
}

/**
 * Voraussetzungen eines Skills für einen Charakter. `owned` ist die Skill-
 * Liste des Bogens ({ name, level }). Jeder Elternskill muss das Level haben,
 * das die Ebene verlangt (LEVEL_REQ).
 */
export function unlockStatus(tree, id, owned = []) {
  const skill = tree.skills[id];
  const byName = new Map();
  for (const entry of owned) {
    if (entry?.name) byName.set(norm(entry.name), Number(entry.level || 0));
  }

  const needed = LEVEL_REQ[skill.level] ?? 0;
  const parents = skill.parents.map(parentId => {
    const parent = tree.skills[parentId];
    const has = byName.has(norm(parent.name));
    const level = has ? byName.get(norm(parent.name)) : 0;
    return { id: parentId, name: parent.name, has, level, needed, ok: has && level >= needed };
  });

  return {
    owned: byName.has(norm(skill.name)),
    ownedLevel: byName.get(norm(skill.name)) ?? 0,
    needed,
    parents,
    ready: parents.every(parent => parent.ok)
  };
}

/** Erster Satz der Beschreibung, höchstens 160 Zeichen, für das Wirkungsfeld im Bogen. */
export function shortEffect(skill) {
  const text = String(skill?.kern || "").replace(/\s+/g, " ").trim();
  const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] || text;
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

/**
 * Eintrag für system.isekaiSkills.
 *
 * Trägt die Schadensarten, die stillgelegten Eltern und eine etwaige
 * Bedingung mit, damit der Bogen die DR rechnen kann, ohne den Baum zu
 * kennen. Das Startlevel ist der abgerundete Durchschnitt der Elternlevel
 * des Charakters; ohne Eltern beginnt der Skill bei 1.
 */
export const sheetCategory = (skill) =>
  skill?.cat in SKILL_CATEGORIES ? skill.cat : (TYPE_CATEGORY[skill?.type] || "fertigkeit");

export function sheetEntry(skill, parentLevels = [], tree = null) {
  // Im Baum stehen in `replaces` die Ids der Eltern. Der Bogen kennt nur
  // Namen, deshalb werden sie hier aufgeloest.
  const replaces = toArray(skill.replaces)
    .map(id => tree?.skills?.[id]?.name || id);

  return {
    name: skill.name,
    rarity: skill.floor,
    level: derivedStartLevel(parentLevels),
    attribute: skill.attr,
    category: sheetCategory(skill),
    types: toArray(skill.types).join(","),
    replaces: replaces.join(","),
    cond: skill.cond || "",
    effect: shortEffect(skill)
  };
}
