// Aufbereitung des Skill-Baums fuer die Anzeige.
//
// Eine Quelle fuer zwei Ausgaben: das Fenster in Foundry und die
// eigenstaendige HTML-Datei. Beide bekommen damit dieselben Spalten und
// dasselbe Detail — ohne Foundry, also auch testbar.
import {
  ARCH_FORMULAS, BOOST_FORMULAS, BOOST_TARGETS, SKILL_CATEGORIES, condLabel, machtfaktor, rarityRank,
  resistanceDR, skillBonus, skillBoosts, typeLabels
} from "./rules.js";
import {
  LEVEL_FLOOR, LEVEL_REQ, MAX_LEVEL, TYPE_CATEGORY, TYPE_LABELS, ancestors, descendants,
  effectLines, sheetCategory, unlockStatus
} from "./skill-graph.js";

export const DOMAIN_LABELS = {
  waffen: "Waffen", verteidigung: "Verteidigung", spezial: "Spezialangriffe", magie: "Magie",
  wissen: "Wissen", herstellung: "Herstellung", resistenz: "Resistenz", allgemein: "Allgemein",
  kombi: "Verschmelzungen"
};

export const norm = (text) => String(text ?? "").trim().toLowerCase();

// Ohne Charakter wird mit diesem Level gerechnet, damit eine Zahl konkret wird.
export const BEISPIEL_LEVEL = 10;

/** Die Reiter: "Alle" und die Bereiche des Baums. */
export const domainList = (tree, active = "alle") =>
  [{ key: "alle", label: "Alle" }, ...tree.doms.map(key => ({ key, label: DOMAIN_LABELS[key] || key }))]
    .map(entry => ({ ...entry, active: entry.key === active }));

/**
 * Die Spalten je Ebene. `selected`, `anc` und `desc` steuern nur die
 * Markierung; ohne sie entsteht die Ansicht ohne Auswahl.
 */
export function columnList(tree, {
  domain = "alle", selected = null, ownedNames = new Set(), anc = new Set(), desc = new Set()
} = {}) {
  const visible = tree.order
    .map(id => tree.skills[id])
    .filter(skill => domain === "alle" || skill.domain === domain);

  const columns = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const skills = visible
      .filter(skill => skill.level === level)
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map(skill => {
        // Liegen alle Elternskills in anderen Bereichen, sieht der Skill in
        // diesem Reiter wurzellos aus. Der Weg zur Ebene 1 fuehrt dann ueber
        // einen anderen Reiter, und das muss am Kaestchen stehen.
        const auswaerts = skill.parents.length
          && skill.parents.every(parent => tree.skills[parent]?.domain !== skill.domain);
        const bereiche = [...new Set(skill.parents
          .map(parent => DOMAIN_LABELS[tree.skills[parent]?.domain] || ""))].filter(Boolean);

        return {
          id: skill.id,
          name: skill.name,
          lname: norm(skill.name),
          rarity: skill.floor,
          title: `${skill.name} (${skill.kind}${skill.custom ? ", eigener Skill" : skill.changed ? ", geändert" : ""})` +
            (auswaerts ? ` — Voraussetzung in ${bereiche.join(" und ")}` : ""),
          cls: [
            ownedNames.has(norm(skill.name)) ? "owned" : "",
            skill.custom || skill.changed ? "custom" : "",
            auswaerts ? "extern" : "",
            skill.id === selected ? "sel" : anc.has(skill.id) ? "anc" : desc.has(skill.id) ? "desc" : ""
          ].filter(Boolean).join(" ")
        };
      });
    if (!skills.length) continue;
    columns.push({ level, floor: tree.rn[LEVEL_FLOOR[level] - 1], req: LEVEL_REQ[level], skills });
  }
  return columns;
}

/**
 * Was der Skill konkret bringt — gerechnet mit dem Level aus dem Bogen, sonst
 * mit BEISPIEL_LEVEL. Die Formel selbst steht einmal in ARCH_FORMULAS und wird
 * hier nicht wiederholt.
 */
export function payoff(skill, status) {
  const level = status.owned ? Number(status.ownedLevel || 0) : BEISPIEL_LEVEL;
  const rank = rarityRank(skill.floor);
  const factor = machtfaktor(skill.floor);
  const category = sheetCategory(skill);
  const lines = [];

  const head = status.owned
    ? `Level ${level}, ${skill.floor} (Stufe ${rank}, Machtfaktor ${factor})`
    : `Beispiel Level ${BEISPIEL_LEVEL}, ${skill.floor} (Stufe ${rank}, Machtfaktor ${factor})`;

  const types = typeLabels(skill.types);
  const bonus = skillBonus({ level, rarity: skill.floor, category, bonusMode: skill.bonusMode });
  const nurGegen = skill.cond ? ` — nur gegen ${condLabel(skill.cond)}` : "";

  // Je Kategorie eine Zeile. Bei einer Resistenz ist der Bonus die
  // Schadensreduktion selbst, sie darf nicht zweimal erscheinen.
  switch (category) {
    case "resistenz":
      lines.push(types.length
        ? `Schadensreduktion <b>${bonus}</b> gegen ${types.join(", ")}${nurGegen}`
        : `Schadensreduktion <b>${bonus}</b> — ohne Schadensart ohne Wirkung auf den Schaden`);
      break;
    case "modifikation":
      lines.push(`Bonus auf den Angriff <b>${bonus}</b>` +
        `; beim Bonustyp Anzahl Gegner <b>${bonus}</b> zusätzliche Ziele für −${6 - rank} AW`);
      break;
    case "passiv":
      lines.push(`Passiver Wert <b>${bonus}</b>`);
      break;
    case "aktiv":
      lines.push(`Bonus <b>${bonus}</b> plus die Hälfte deines ${skill.attr} (abgerundet)`);
      break;
    default:
      lines.push(`Bonus <b>${bonus}</b> plus dein ${skill.attr}`);
  }

  // Ein Skill ausserhalb der Resistenz-Tabelle kann trotzdem Schaden mindern.
  if (category !== "resistenz" && types.length) {
    lines.push(`Schadensreduktion <b>${resistanceDR({ level, rarity: skill.floor })}</b>` +
      ` gegen ${types.join(", ")}${nurGegen}`);
  }

  if (skill.arch === "waffe" || skill.arch === "zauber") {
    lines.push(`Schadenswürfel und Schadensbonus × ${factor}`);
  }

  for (const boost of skillBoosts({ ...skill, level, rarity: skill.floor })) {
    const vorzeichen = boost.lowers ? "−" : "+";
    lines.push(`<b>${vorzeichen}${boost.amount}</b> ${BOOST_TARGETS[boost.target]}` +
      (boost.situation
        ? ` — nur ${boost.situation}, der Bogen rechnet es nicht ein`
        : " — rechnet der Bogen von selbst ein"));
  }

  return { head, lines, sample: !status.owned };
}

/**
 * Alles, was das Detail eines Skills zeigt. Ohne Charakter bleiben die Felder
 * zum Hinzufuegen leer und der Payoff rechnet mit dem Beispiel-Level.
 */
export function detailData(tree, id, { owned = [], hasActor = false, actorName = "", canAdd = false } = {}) {
  const skill = tree.skills[id];
  if (!skill) return null;

  const status = unlockStatus(tree, id, owned);
  const anc = ancestors(tree, id);
  const link = (parentId) => ({
    id: parentId,
    name: tree.skills[parentId].name,
    rarity: tree.skills[parentId].floor
  });

  return {
    id: skill.id,
    name: skill.name,
    level: skill.level,
    floor: skill.floor,
    kind: skill.kind,
    custom: skill.custom,
    changed: Boolean(skill.changed),
    domainLabel: DOMAIN_LABELS[skill.domain] || skill.domain,
    categoryLabel: SKILL_CATEGORIES[sheetCategory(skill)],
    attr: skill.attr,
    typeLabel: TYPE_LABELS[skill.type],
    res: skill.res,
    kern: skill.kern,
    hasActor,
    actorName,
    owned: status.owned,
    ownedLevel: status.ownedLevel,
    needed: status.needed,
    canAdd: canAdd && !status.owned,
    auswaerts: Boolean(skill.parents.length) &&
      skill.parents.every(parent => tree.skills[parent]?.domain !== skill.domain),
    parents: status.parents.map(parent => ({
      ...link(parent.id),
      level: parent.level,
      needed: parent.needed,
      ok: parent.ok,
      hint: parent.has ? `Level ${parent.level}, nötig ${parent.needed}` : "nicht im Bogen"
    })),
    ancestors: [...anc]
      .sort((a, b) => (tree.skills[a].level - tree.skills[b].level) ||
        tree.skills[a].name.localeCompare(tree.skills[b].name, "de"))
      .map(link),
    children: skill.children.map(link),
    formula: ARCH_FORMULAS[skill.arch] || "",
    bonusModeLabel: BOOST_FORMULAS[skill.bonusMode] || "",
    payoff: payoff(skill, status),
    effects: effectLines(tree, id)
  };
}

/** Vorstufen und Nachfolger je Skill, fuer die Markierung der Kaestchen. */
export function relations(tree) {
  const out = {};
  for (const id of tree.order) {
    out[id] = { anc: [...ancestors(tree, id)], desc: [...descendants(tree, id)] };
  }
  return out;
}

export { TYPE_CATEGORY };
