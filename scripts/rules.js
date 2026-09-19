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

// Gespeicherte Typlisten können aus alten Daten als Objekt kommen.
export const typeList = (value) => toArray(value).filter(key => key in DAMAGE_TYPES);

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
