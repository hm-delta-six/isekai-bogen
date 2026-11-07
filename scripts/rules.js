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
  energie: "Energie",
  // Gift richtet Schaden an und ist deshalb eine Schadensart wie die anderen.
  // Krankheit dagegen kostet Proben und Zustaende, nicht Lebenspunkte, und
  // hat darum keine Schadensart.
  gift: "Gift"
};

export const rarityRank = (rarity) => RARITY_MAP[rarity] || 1;
export const machtfaktor = (rarity) => MACHTFAKTOR_MAP[rarity] || 1;

/**
 * Machtstufe: 2 hoch (Raritätsstufe − 1), mindestens 1 — also 1, 2, 4, 8, 16,
 * 32. Dieselbe Reihe wie der Machtfaktor; die Regeln nennen sie beim
 * Flächenangriff Machtstufe und beim Schaden Machtfaktor. Ein Zahlenwerk
 * unter zwei Namen, damit beide nicht auseinanderlaufen können.
 */
export const machtstufe = machtfaktor;

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
 * Grundlage ist die Machtstufe der Waffe (2 hoch Raritätsstufe):
 *
 *   Markierte Gegner  Skill-Level
 *   Kegel             Machtstufe × Skill-Level        (Länge)
 *   Kreis             Machtstufe × Skill-Level / 2    (Durchmesser)
 *   Linie             Machtstufe × Skill-Level × 2    (Länge, 1 breit)
 */
export function areaMaximum(mode, rarity, skillLevel) {
  const level = Math.max(0, Number(skillLevel || 0));
  const base = machtstufe(rarity) * level;
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
  passiv:       "Passive Skills",
  resistenz:    "Resistenzen"
};

export const SKILL_CATEGORY_HINTS = {
  fertigkeit:   "Hängen von nichts ab und ändern nichts. Offen oder vergleichend gewürfelt.",
  aktiv:        "Werden mit einer Waffe oder einem Zauber eingesetzt.",
  modifikation: "Verändern einen Angriff. Lassen sich in der Waffenkarte hinzufügen.",
  passiv:       "Immer aktiv, kein Wurf nötig.",
  resistenz:    "Mindern Schaden einer Art. Zählen in die Schadensreduktion der Kampfwerte."
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

/**
 * Quellen, auf die sich eine Resistenz beschraenken kann. Sie zählen nicht in
 * die flache DR, weil ein Angriff im Modul keine Quelle mitbringt.
 */
export const COND_LABELS = { magie: "Magie" };

/**
 * Skill eines Bogens nach Namen. Gross- und Kleinschreibung spielt keine
 * Rolle, damit eine Verknuepfung durch Tippen nicht zerbricht.
 */
export function skillByName(skills, name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return null;
  return toArray(skills).find(skill =>
    String(skill?.name || "").trim().toLowerCase() === wanted) || null;
}

/**
 * Welches Attribut den Verteidigungswert traegt: das des Abwehr-Skills, der am
 * meisten dazu beitraegt. Ausweichen rechnet mit DEX, Parade mit STR. Wer
 * beides hat, verteidigt mit seinem starkeren Skill.
 *
 * Fruehere Fassungen liessen das im Bogen auswaehlen. Das war nicht noetig:
 * die Skills sagen selbst, welches Attribut sie fuehren.
 */
export function defenceSkill(skills, fallbackAttribute = "DEX") {
  let beste = null;

  for (const skill of toArray(skills)) {
    if (!skill) continue;
    for (const boost of skillBoosts(skill)) {
      // Nur was wirklich zaehlt: eine Steigerung mit Lage traegt den Wert
      // nicht, also auch nicht das Attribut.
      if (boost.target !== "vw" || boost.situation) continue;
      if (!beste || boost.amount > beste.amount) {
        beste = { name: skill.name, amount: boost.amount, attribute: skill.attribute || fallbackAttribute };
      }
    }
  }

  return {
    name: beste?.name || null,
    amount: beste?.amount || 0,
    attribute: beste?.attribute || fallbackAttribute
  };
}
export const condLabel = (cond) => COND_LABELS[cond] || "";

// Rechenregel des Skill-Bonus je Kategorie, für die Hilfe im Bogen.
export const SKILL_BONUS_FORMULAS = {
  fertigkeit:   "Skill-Level × Raritätsstufe + Attribut",
  aktiv:        "Skill-Level + halber Attributswert (abgerundet)",
  modifikation: "Skill-Level × Raritätsstufe",
  passiv:       "Skill-Level × Raritätsstufe / 2 (abgerundet)",
  // Bei einer Resistenz ist der Bonus die Schadensreduktion selbst.
  resistenz:    "Skill-Level × Machtfaktor der Raritätsstufe"
};

// Nur bei diesen Kategorien geht das Attribut in den Bonus ein; bei den
// anderen wird die Spalte im Bogen deshalb gar nicht erst angezeigt.
export const SKILL_USES_ATTRIBUTE = {
  fertigkeit:   true,
  aktiv:        true,
  modifikation: false,
  passiv:       false,
  resistenz:    false
};

/**
 * Bonus eines Skills. Die Formel hängt an der Kategorie.
 * attributeValue ist der effektive Attributswert inklusive Titel-Boni.
 */
/**
 * Was das Skill-Level vervielfacht. Ohne Angabe gilt die Regel der Kategorie;
 * ein Skill kann es im Baum abweichend festlegen.
 */
export const BONUS_MODES = {
  rank:   "Raritätsstufe (1 bis 6)",
  factor: "Machtstufe (1, 2, 4, 8, 16, 32)",
  none:   "nichts, nur das Skill-Level"
};

export const bonusMultiplier = (skill, fallback) => {
  switch (skill?.bonusMode in BONUS_MODES ? skill.bonusMode : fallback) {
    case "factor": return machtfaktor(skill?.rarity);
    case "none":   return 1;
    default:       return rarityRank(skill?.rarity);
  }
};

export function skillBonus(skill, attributeValue = 0) {
  const level = Math.max(0, Number(skill?.level || 0));
  const attribute = Number(attributeValue || 0);
  const category = skillCategory(skill);

  // Die Kategorie sagt, was ohne eigene Angabe vervielfacht wird.
  const standard = category === "resistenz" ? "factor" : category === "aktiv" ? "none" : "rank";
  const faktor = bonusMultiplier(skill, standard);

  switch (category) {
    case "aktiv":        return level * faktor + Math.floor(attribute / 2);
    case "modifikation": return level * faktor;
    case "passiv":       return Math.floor(level * faktor / 2);
    case "resistenz":    return level * faktor;
    default:             return level * faktor + attribute;
  }
}

// Bonushöhe eines Modifikations-Skills: Raritätsstufe × Skill-Level.
export const modBonus = (skill) => skillBonus({ ...skill, category: "modifikation" });

/**
 * Preis dafür, einen Angriff auf mehrere Gegner zu verteilen: 6 − Raritätsstufe
 * auf den AW. Ein Common-Rundumschlag kostet also 5 AW, ein transzendierter
 * nichts mehr — die Zahl der Ziele selbst ist Skill-Level × Raritätsstufe und
 * nicht begrenzt.
 */
export const targetMalus = (skill) => Math.max(0, 6 - rarityRank(skill?.rarity));

/**
 * Fasst die gewählten Modifikationen zu Summen je Bonustyp und zu Kosten je
 * Ressource zusammen.
 */
export function summarizeMods(mods) {
  const bonus = { aw: 0, damage: 0, targets: 0, range: 0 };
  const cost = { hp: 0, mp: 0, ap: 0 };
  let malus = 0;

  for (const mod of toArray(mods)) {
    if (!mod) continue;
    if (mod.bonusType in bonus) bonus[mod.bonusType] += Number(mod.bonus || 0);
    if (mod.costType in cost) cost[mod.costType] += Math.max(0, Number(mod.costValue || 0));
    malus += Math.max(0, Number(mod.awMalus || 0));
  }

  return { bonus, cost, malus };
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
    cond: skill.cond || found.cond || "",
    boosts: toArray(skill.boosts).length ? skill.boosts : toArray(found.boosts),
    bonusMode: skill.bonusMode || found.bonusMode || "",
    // Die Tabelle bestimmt der Baum. Im Bogen laesst sie sich nicht aendern,
    // und Resistenzen standen vor der eigenen Tabelle bei den passiven Skills.
    category: found.cat in SKILL_CATEGORIES ? found.cat : skill.category
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

/**
 * Rechenregel je Skill-Archetyp des Baums, fuer die Anzeige im Skill-Baum.
 * Steht genau hier, damit eine Formel nicht in jeder Raritaetszeile wiederholt
 * werden muss — die Zeilen nennen nur noch den konkreten Wert.
 */
export const ARCH_FORMULAS = {
  resist:   `Schadensreduktion = ${RESISTANCE_FORMULA}. Mehrere Resistenzen addieren sich, es gibt keinen Deckel.`,
  passiv:   `Passiver Wert = ${SKILL_BONUS_FORMULAS.passiv}.`,
  mod:      `Bonus auf den Angriff = ${SKILL_BONUS_FORMULAS.modifikation}.`,
  probe:    `Bonus auf die Probe = ${SKILL_BONUS_FORMULAS.fertigkeit}.`,
  waffe:    "Der Machtfaktor vervielfacht Schadenswürfel und Schadensbonus; Skill-Level und Machtfaktor zählen auf den AW.",
  zauber:   "Der Machtfaktor vervielfacht Schadenswürfel und Schadensbonus des Zaubers.",
  abwehr:   "Die Rarität entscheidet, gegen welche Angriffsstufe die Abwehr noch voll zählt.",
  wissen:   "",
  handwerk: ""
};

/**
 * Werte, die ein Skill steigern kann. Der Bogen rechnet sie von selbst ein —
 * niemand muss ein Skill-Level von Hand in ein Bonusfeld eintragen.
 */
export const BOOST_TARGETS = {
  aw:         "Angriffswert",
  vw:         "Verteidigungswert",
  init:       "Initiative",
  hp:         "HP",
  mp:         "MP",
  ap:         "AP",
  armormalus: "Rüstungsmalus",
  speed:      "Geschwindigkeit",
  range:      "Reichweite",
  // Zaehlt auf jede Skill-Probe dieses Charakters.
  check:      "Skill-Proben"
};

// Diese Ziele senken einen Malus, statt einen Wert zu heben.
export const BOOST_LOWERS = new Set(["armormalus"]);

/**
 * Rechenregeln einer Steigerung. Ohne Angabe gilt `standard`:
 * Skill-Level × Raritätsstufe.
 */
export const BOOST_FORMULAS = {
  standard: "Skill-Level × Raritätsstufe",
  half:     "Skill-Level × Raritätsstufe ÷ 2 (abgerundet)",
  factor:   "Skill-Level × Machtfaktor",
  level:    "Skill-Level",
  fifth:    "Skill-Level ÷ 5 (abgerundet)"
};

/**
 * Die Grundregel, einmal formuliert: ohne eigene Angabe steigert ein Skill um
 * Skill-Level × Raritätsstufe.
 */
export const BOOST_DEFAULT_NOTE =
  `Ohne eigene Rechenregel steigert ein Skill um ${BOOST_FORMULAS.standard}.`;

export function boostAmount(skill, formula = "standard") {
  const level = Math.max(0, Number(skill?.level || 0));
  const rank = rarityRank(skill?.rarity);

  switch (formula) {
    case "half":   return Math.floor(level * rank / 2);
    case "factor": return level * machtfaktor(skill?.rarity);
    case "level":  return level;
    case "fifth":  return Math.floor(level / 5);
    default:       return level * rank;
  }
}

/**
 * Steigerungen eines Skills aus dem Baum. Ein Eintrag ist
 * { t: Ziel, f: Rechenregel (optional), s: Bedingung (optional) }.
 *
 * Mit Bedingung wird die Steigerung im Bogen genannt, aber nicht
 * mitgerechnet: sie gilt nur in einer bestimmten Lage (in Bewegung, gegen
 * Angriffe von vorn), und die kennt der Bogen nicht.
 */
export function skillBoosts(skill) {
  return toArray(skill?.boosts)
    .filter(entry => entry && entry.t in BOOST_TARGETS)
    .map(entry => ({
      target: entry.t,
      formula: entry.f in BOOST_FORMULAS ? entry.f : "standard",
      situation: entry.s || "",
      amount: boostAmount(skill, entry.f),
      lowers: BOOST_LOWERS.has(entry.t)
    }));
}

/**
 * Summe aller Steigerungen einer Skill-Liste, getrennt nach Ziel. `sources`
 * nennt, woher ein Wert kommt, damit der Bogen es zeigen kann; `situational`
 * sammelt, was nur in einer bestimmten Lage gilt.
 */
export function boostTotals(skills) {
  const totals = {};
  const sources = {};
  const situational = [];
  for (const key of Object.keys(BOOST_TARGETS)) { totals[key] = 0; sources[key] = []; }

  for (const skill of toArray(skills)) {
    if (!skill) continue;
    for (const boost of skillBoosts(skill)) {
      const entry = { name: skill.name, ...boost };
      if (boost.situation) { situational.push(entry); continue; }
      if (!boost.amount) continue;
      totals[boost.target] += boost.amount;
      sources[boost.target].push(entry);
    }
  }

  return { totals, sources, situational };
}

/**
 * Flache Boni eines Typs. Titel und Ausruestung koennen beide einen Typ und
 * einen Bonus tragen; beides wird hier gezaehlt, damit Bogen und Angriffswurf
 * dieselbe Summe sehen. Vorher las der Bogen nur die Titel und der
 * Angriffswurf beides.
 */
export function typeBonus(system, type) {
  const sum = (list) => toArray(list)
    .reduce((acc, entry) => (entry?.type === type ? acc + Number(entry.bonus || 0) : acc), 0);
  return sum(system?.titles) + sum(system?.equipment);
}

// Attributswert samt flacher Boni auf dieses Attribut.
export const abilityValue = (system, key) => {
  const attribute = String(key || "STR").toUpperCase();
  return Number(system?.abilities?.[attribute]?.value || 0) + typeBonus(system, attribute);
};

/**
 * Angriffswert. Ohne Waffe ist es der Grundwert des Bogens, mit Waffe der
 * Wert des Angriffs: dann kommen Level und Machtfaktor des Waffenskills, das
 * Attribut dieses Skills und der Waffenbonus hinzu.
 *
 * Eine Funktion fuer beide Faelle, damit der Wert im Bogen und der Wert im
 * Wurf nicht auseinanderlaufen koennen.
 */
export function attackTotal(system, skills, weapon = null, skill = null) {
  const boni = system?.boni || {};
  const used = weapon ? (skill || { level: 0, factor: 0, attribute: "STR" }) : null;
  const attribute = used ? used.attribute || "STR" : "STR";

  // Der Angriffsskill zaehlt mit Skill-Level x Raritaetsstufe auf den AW,
  // nicht mit Level plus Machtfaktor.
  return 10 +
    Number(boni.awSkill || 0) +
    (used ? Number(used.level || 0) * rarityRank(used.rarity) : 0) +
    abilityValue(system, attribute) +
    Number(boni.aw || 0) + typeBonus(system, "AW") +
    boostTotals(skills).totals.aw +
    (weapon ? Number(weapon.bonus || 0) : 0);
}

/**
 * Verteidigungswert. Dieselbe Rechnung fuer den Bogen und fuer den Angriff
 * gegen diesen Charakter — vorher las der Angriff einen Wert, den nur der
 * Bogen schreibt, und fiel ohne ihn auf 10 zurueck.
 */
export function defenceTotal(system, skills) {
  const boni = system?.boni || {};
  const boosts = boostTotals(skills);
  const defence = defenceSkill(skills);
  const malus = Math.max(0, Number(boni.armormalus || 0) - boosts.totals.armormalus);

  return 10 +
    Number(boni.vwSkill || 0) +
    abilityValue(system, defence.attribute) +
    Number(boni.vw || 0) + typeBonus(system, "VW") -
    malus +
    boosts.totals.vw;
}

// Initiative.
export function initiativeTotal(system, skills) {
  const boni = system?.boni || {};
  return abilityValue(system, "DEX") + Number(boni.init || 0) +
    typeBonus(system, "INIT") + boostTotals(skills).totals.init;
}
