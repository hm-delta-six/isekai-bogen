// Gemeinsame Regeldaten. Lagen vorher teils doppelt in custom-sheet.js und
// attack.js — eine Änderung musste dort an zwei Stellen nachgezogen werden.

// Raritätsstufe R: geht in Skill-Caps, Rüstungsvergleiche und Resistenzen ein.
export const RARITY_MAP = {
  "Common": 1, "Uncommon": 2, "Rare": 3, "Epic": 4, "Legendary": 5, "Transzendiert": 6
};

// Machtfaktor M: Multiplikator auf den Schadenswürfel.
export const MACHTFAKTOR_MAP = {
  "Common": 1, "Uncommon": 2, "Rare": 4, "Epic": 8, "Legendary": 16, "Transzendiert": 32
};

export const RARITY_CHOICES = Object.keys(RARITY_MAP)
  .reduce((choices, name) => ({ ...choices, [name]: name }), {});

// Schlüssel werden gespeichert, die Beschriftung nur angezeigt.
export const DAMAGE_TYPES = {
  hieb: "Hieb",
  stich: "Stich",
  wucht: "Wucht",
  feuer: "Feuer",
  saeure: "Säure",
  elektrizitaet: "Elektrizität",
  schall: "Schall",
  kaelte: "Kälte",
  energie: "Energie"
};

export const rarityRank = (rarity) => RARITY_MAP[rarity] || 1;
export const machtfaktor = (rarity) => MACHTFAKTOR_MAP[rarity] || 1;

export const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
};

/**
 * Typlisten werden als kommagetrennte Zeichenkette gespeichert, damit sie ein
 * normales Formularfeld sein können: _getSubmitData sammelt nur Felder, die im
 * Formular stehen, und ersetzt die ganze Liste — ein Feld ausserhalb des
 * Formulars wäre beim nächsten Speichern weg.
 *
 * Ältere Einträge können noch ein Array oder Objekt enthalten.
 */
export const typeList = (value) => {
  const raw = typeof value === "string" ? value.split(",") : toArray(value);
  return raw.map(key => String(key).trim()).filter(key => key in DAMAGE_TYPES);
};

export const typeValue = (value) => typeList(value).join(",");

/**
 * Wie typeList, aber fuer freie Namen (stillgelegte Eltern). Auch hier ist die
 * Speicherform eine kommagetrennte Zeichenkette, damit das Feld im Formular
 * stehen kann.
 */
export const nameList = (value) => (typeof value === "string" ? value.split(",") : toArray(value))
  .map(entry => String(entry).trim()).filter(Boolean);

export const typeLabels = (value) => typeList(value).map(key => DAMAGE_TYPES[key]);

// Angriffsbereich einer Waffe
export const AREA_MODES = {
  single: "Einzelangriff",
  marked: "Markierte Gegner",
  cone: "Kegel",
  circle: "Kreis",
  line: "Linie"
};

/**
 * Größte zulässige Ausdehnung in Kästchen (1 Kästchen = 5 Fuß / 1,5 m),
 * bei "marked" die Zahl der Ziele. Einzelangriff hat keine Größe.
 *
 *   Markierte Gegner  Skill-Level
 *   Kegel             Raritätsstufe × Skill-Level        (Länge)
 *   Kreis             Raritätsstufe × Skill-Level / 2    (Durchmesser)
 *   Linie             Raritätsstufe × Skill-Level × 2    (Länge, 1 breit)
 */
export function areaMaximum(mode, rarity, skillLevel) {
  const level = Math.max(0, Number(skillLevel || 0));
  const base = rarityRank(rarity) * level;
  switch (mode) {
    case "marked": return Math.max(1, level);
    case "cone":   return Math.max(1, base);
    case "circle": return Math.max(1, Math.floor(base / 2));
    case "line":   return Math.max(1, base * 2);
    default:       return null;
  }
}

/**
 * Tatsächliche Größe aus der Eingabe im Bogen. Leeres Feld bedeutet volle
 * Größe — so wächst die Fläche mit dem Skill mit, ohne dass ein einmal
 * gespeicherter Wert veraltet. Wer die Fläche verkleinert, zahlt −1 AW pro
 * Kästchen; weniger markierte Ziele kosten nichts.
 */
export function areaSetting(mode, rarity, skillLevel, requested) {
  const key = mode in AREA_MODES ? mode : "single";
  const max = areaMaximum(key, rarity, skillLevel);
  if (max === null) return { mode: key, max: null, size: null, malus: 0 };

  const wanted = Math.floor(Number(requested));
  const empty = requested === "" || requested === null || requested === undefined;
  const size = empty || !Number.isFinite(wanted) || wanted <= 0 ? max : Math.min(wanted, max);
  const malus = key === "marked" ? 0 : max - size;

  return { mode: key, max, size, malus };
}

// Skill-Kategorien. Alle Skills stehen weiter in einer Liste, damit
// Verknüpfungen von Waffen und Resistenzen gültig bleiben; die Kategorie
// steuert nur, in welcher Tabelle der Skill erscheint.
export const SKILL_CATEGORIES = {
  fertigkeit:   "Fertigkeiten",
  aktiv:        "Aktive Skills",
  modifikation: "Angriffs-Modifikationen",
  passiv:       "Passive Skills"
};

export const SKILL_CATEGORY_HINTS = {
  fertigkeit:   "Hängen von nichts ab und ändern nichts. Offen oder vergleichend gewürfelt.",
  aktiv:        "Werden mit einer Waffe oder einem Zauber eingesetzt.",
  modifikation: "Verändern einen Angriff. Lassen sich in der Waffenkarte hinzufügen.",
  passiv:       "Immer aktiv, kein Wurf nötig."
};

export const skillCategory = (skill) =>
  skill?.category in SKILL_CATEGORIES ? skill.category : "fertigkeit";

// Was ein Modifikations-Skill am Angriff verändert.
export const MOD_BONUS_TYPES = {
  aw:      "AW",
  damage:  "Schaden",
  targets: "Anzahl Gegner",
  range:   "Reichweite"
};

export const COST_TYPES = { hp: "HP", mp: "MP", ap: "AP" };

// Rechenregel des Skill-Bonus je Kategorie, für die Hilfe im Bogen.
export const SKILL_BONUS_FORMULAS = {
  fertigkeit:   "Skill-Level × Raritätsstufe + Attribut",
  aktiv:        "Skill-Level + halber Attributswert (abgerundet)",
  modifikation: "Skill-Level × Raritätsstufe",
  passiv:       "Skill-Level × Raritätsstufe / 2 (abgerundet)"
};

// Nur bei diesen Kategorien geht das Attribut in den Bonus ein; bei den
// anderen wird die Spalte im Bogen deshalb gar nicht erst angezeigt.
export const SKILL_USES_ATTRIBUTE = {
  fertigkeit:   true,
  aktiv:        true,
  modifikation: false,
  passiv:       false
};

/**
 * Bonus eines Skills. Die Formel hängt an der Kategorie.
 * attributeValue ist der effektive Attributswert inklusive Titel-Boni.
 */
export function skillBonus(skill, attributeValue = 0) {
  const level = Math.max(0, Number(skill?.level || 0));
  const rank = rarityRank(skill?.rarity);
  const attribute = Number(attributeValue || 0);

  switch (skillCategory(skill)) {
    case "aktiv":        return level + Math.floor(attribute / 2);
    case "modifikation": return level * rank;
    case "passiv":       return Math.floor(level * rank / 2);
    default:             return level * rank + attribute;
  }
}

// Bonushöhe eines Modifikations-Skills: Raritätsstufe × Skill-Level.
export const modBonus = (skill) => skillBonus({ ...skill, category: "modifikation" });

/**
 * Fasst die gewählten Modifikationen zu Summen je Bonustyp und zu Kosten je
 * Ressource zusammen.
 */
export function summarizeMods(mods) {
  const bonus = { aw: 0, damage: 0, targets: 0, range: 0 };
  const cost = { hp: 0, mp: 0, ap: 0 };

  for (const mod of toArray(mods)) {
    if (!mod) continue;
    if (mod.bonusType in bonus) bonus[mod.bonusType] += Number(mod.bonus || 0);
    if (mod.costType in cost) cost[mod.costType] += Math.max(0, Number(mod.costValue || 0));
  }

  return { bonus, cost };
}

/**
 * Schadensreduktion einer Resistenz: Skill-Level × Machtfaktor der Rarität.
 *
 * Flach, ohne Deckel und ohne Unterschied zwischen spezialisierten und
 * allgemeinen Resistenzen. Die früheren Prozentregeln aus Wiki 9.2 und 9.3
 * entfallen damit vollständig — es gibt genau diese eine Formel.
 */
export const RESISTANCE_FORMULA = "Skill-Level × Machtfaktor der Raritätsstufe";

export const resistanceDR = (skill) =>
  Math.max(0, Number(skill?.level || 0)) * machtfaktor(skill?.rarity);

/**
 * Startlevel eines abgeleiteten Skills: Durchschnitt der Elternlevel,
 * abgerundet. Ohne Eltern beginnt er bei 1.
 */
export function derivedStartLevel(parentLevels) {
  const levels = toArray(parentLevels).map(value => Math.max(0, Number(value || 0)));
  if (!levels.length) return 1;
  return Math.floor(levels.reduce((sum, value) => sum + value, 0) / levels.length);
}

/**
 * Gesamte DR je Schadensart aus Rüstung und Resistenz-Skills.
 *
 * Ein Skill zählt nicht, wenn ein anderer vorhandener Skill ihn stilllegt —
 * im Baum steht dafür `replaces`. Bedingte Resistenzen (nur gegen Magie, nur
 * gegen Gift) werden getrennt geführt, weil ein Angriff im Modul keine Quelle
 * mitbringt und sie sonst gegen alles zählen würden.
 */
export function damageReduction({ armors = [], resistances = [] } = {}) {
  const flat = {};
  const conditional = {};
  for (const key of Object.keys(DAMAGE_TYPES)) { flat[key] = 0; conditional[key] = 0; }

  for (const armor of toArray(armors)) {
    if (!armor || Number(armor.durability || 0) <= 0) continue;
    const covered = typeList(armor.types);
    const against = covered.length ? covered : Object.keys(DAMAGE_TYPES);
    for (const key of against) flat[key] += Number(armor.dr || 0);
  }

  const retired = new Set();
  const retiredLabels = [];
  for (const skill of toArray(resistances)) {
    for (const name of nameList(skill?.replaces)) {
      if (retired.has(name.toLowerCase())) continue;
      retired.add(name.toLowerCase());
      retiredLabels.push(name);
    }
  }

  const active = [];
  for (const skill of toArray(resistances)) {
    if (!skill) continue;
    if (retired.has(String(skill.name || "").trim().toLowerCase())) continue;
    const value = resistanceDR(skill);
    const types = typeList(skill.types);
    // Ohne Schadensart traegt der Skill nichts zur DR bei — etwa Abhaertung
    // oder Willensstaerke, die nur Proben verbessern.
    if (!value || !types.length) continue;

    const target = skill.cond ? conditional : flat;
    for (const key of types) target[key] += value;
    active.push({ name: skill.name, value, cond: skill.cond || "", types });
  }

  return { flat, conditional, active, retired: [...retired], retiredLabels };
}

/**
 * Fuellt Schadensarten, Ersetzungen und Bedingung aus dem Skill-Baum nach.
 *
 * Von Hand eingetragene Skills haben diese Felder nicht — nur Skills, die
 * ueber den Baum hinzugefuegt wurden, bringen sie mit. Ohne das Nachfuellen
 * waere die DR eines alten Bogens null.
 */
export function enrichSkill(skill, lookup = null) {
  if (!skill) return skill;
  const found = lookup?.get?.(String(skill.name || "").trim().toLowerCase());
  if (!found) return skill;

  return {
    ...skill,
    types: typeValue(skill.types) || typeValue(found.types),
    replaces: nameList(skill.replaces).length
      ? nameList(skill.replaces).join(",")
      : nameList(found.replaces).join(","),
    cond: skill.cond || found.cond || ""
  };
}

/**
 * Alle Resistenzquellen eines Charakters in einer Liste: die eigene
 * Resistenztabelle und die Skills selbst. Ein Eintrag der Tabelle, der auf
 * einen Skill verweist, vertritt diesen Skill — sonst zaehlte er doppelt.
 */
export function resistanceSources({ resistances = [], skills = [], lookup = null } = {}) {
  const key = (value) => String(value || "").trim().toLowerCase();
  const list = [];
  const seen = new Set();

  const add = (entry) => {
    if (!key(entry?.name) || seen.has(key(entry.name))) return;
    seen.add(key(entry.name));
    list.push(entry);
  };

  for (const resistance of toArray(resistances)) {
    if (!resistance) continue;
    const linked = key(resistance.skillName);
    const found = linked
      ? toArray(skills).find(skill => key(skill?.name) === linked)
      : null;
    const level = linked ? Number(found?.level || 0) : Number(resistance.level || 0);
    add(enrichSkill({ ...resistance, level }, lookup));
    if (linked) seen.add(linked);
  }

  for (const skill of toArray(skills)) {
    if (!skill) continue;
    add(enrichSkill(skill, lookup));
  }

  return list;
}
