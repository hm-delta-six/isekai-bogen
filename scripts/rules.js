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

export const typeLabels = (value) => typeList(value).map(key => DAMAGE_TYPES[key]);

/**
 * Deckel aus Kapitel 9.3: wie viel des eingehenden Schadens eine Resistenz
 * höchstens schlucken kann, abhängig vom Stufenabstand zum Angriff.
 */
export function resistanceCapFactor(resistanceRarity, attackRarity) {
  const difference = rarityRank(resistanceRarity) - rarityRank(attackRarity);
  if (difference >= 2) return 1;
  if (difference === 1) return 0.75;
  if (difference === 0) return 0.5;
  if (difference === -1) return 0.25;
  return 0;
}

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
