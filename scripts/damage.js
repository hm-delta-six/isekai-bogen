import {
  DAMAGE_TYPES, rarityRank, resistanceCapFactor, toArray, typeLabels, typeList
} from "./rules.js";

const MODULE_ID = "isekai-bogen";
const SOCKET = `module.${MODULE_ID}`;

export const ARMOR_WEAR_CHOICES = {
  highest: "Teil mit der höchsten DR nutzt sich ab",
  spread: "Abnutzung auf alle intakten Teile verteilen"
};

export const isIntact = (armor) => Number(armor?.durability || 0) > 0;

// Ein Rüstungsteil ohne gewählte Typen schützt gegen alles. Das hält alte
// Einträge gültig, die vor der Typenauswahl angelegt wurden.
function armorCovers(armor, type) {
  const types = typeList(armor?.types);
  if (!types.length) return true;
  return !type || types.includes(type);
}

// Elementare Resistenzen sind Skills: das Level kommt aus der Skill-Liste.
function resistanceLevel(actor, resistance) {
  const wanted = String(resistance?.skillName || "").trim().toLowerCase();
  if (!wanted) return Number(resistance?.level || 0);

  const found = toArray(actor?.system?.isekaiSkills)
    .find(skill => String(skill?.name || "").trim().toLowerCase() === wanted);
  return Number(found?.level || 0);
}

function resistanceCovers(resistance, type) {
  return type ? typeList(resistance?.types).includes(type) : false;
}

/**
 * Rüstungsteile, die gegen diesen Schadenstyp zählen, und ihre DR-Summe.
 * Ohne Typ (untypisierter Angriff) zählen alle intakten Teile.
 */
export function armorState(actor, type = null) {
  const list = toArray(actor?.system?.armors);
  const pieces = list
    .map((armor, index) => ({ index, armor }))
    .filter(entry => entry.armor && isIntact(entry.armor) && armorCovers(entry.armor, type));

  const totalDR = pieces.reduce((sum, entry) => sum + Number(entry.armor.dr || 0), 0);
  return { list, pieces, totalDR };
}

// Aufschlüsselung für die Überschrift im Bogen: DR je Schadensart.
export function armorSummary(actor) {
  return Object.entries(DAMAGE_TYPES)
    .map(([key, label]) => `${label} ${armorState(actor, key).totalDR}`)
    .join(" · ");
}

/**
 * Kapitel 9.3: Reduktion = Skill-Level × Raritätsstufe, gedeckelt auf einen
 * Anteil des eingehenden Schadens, der vom Stufenabstand zum Angriff abhängt.
 * Eine Resistenz, die mehrere Typen abdeckt, gilt als allgemein und rechnet
 * mit Skill-Level × (Rarität − 1), mindestens Skill-Level / 2.
 *
 * Bei mehreren passenden Resistenzen zählt die stärkste, sie summieren sich
 * nicht — das Wiki kennt kein Stapeln.
 */
export function resistanceAgainst(actor, type, incoming, attackRarity) {
  const candidates = toArray(actor?.system?.resistances)
    .filter(resistance => resistance && resistanceCovers(resistance, type));

  let best = null;

  for (const resistance of candidates) {
    const rank = rarityRank(resistance.rarity);
    const level = resistanceLevel(actor, resistance);
    const general = typeList(resistance.types).length > 1;

    const raw = general
      ? Math.max(level * (rank - 1), level / 2)
      : level * rank;

    const cap = resistanceCapFactor(resistance.rarity, attackRarity) * incoming;
    const reduction = Math.floor(Math.min(raw, cap));

    if (!best || reduction > best.reduction) {
      best = {
        name: resistance.name || "Resistenz",
        rarity: resistance.rarity || "Common",
        level,
        rank,
        general,
        raw: Math.floor(raw),
        cap: Math.floor(cap),
        reduction
      };
    }
  }

  return best;
}

// Verteilt den Verschleiß nach der im Bogen gewählten Regel.
function wearArmor(actor, list, pieces, wearAmount) {
  if (wearAmount <= 0 || !pieces.length) return [];

  const rule = actor?.system?.armorWear === "spread" ? "spread" : "highest";
  const changes = [];

  if (rule === "highest") {
    const target = pieces.reduce((best, entry) =>
      Number(entry.armor.dr || 0) > Number(best.armor.dr || 0) ? entry : best);
    changes.push({ index: target.index, wear: wearAmount });
  } else {
    const base = Math.floor(wearAmount / pieces.length);
    let rest = wearAmount - base * pieces.length;
    for (const entry of pieces) {
      const wear = base + (rest-- > 0 ? 1 : 0);
      if (wear > 0) changes.push({ index: entry.index, wear });
    }
  }

  return changes.map(change => {
    const from = Number(list[change.index]?.durability || 0);
    return { index: change.index, wear: change.wear, from, to: from - change.wear };
  });
}

// Ein einzelner Schadenstyp durchgerechnet: Rüstung, dann Resistenz.
function resolveForType(targetActor, damage, type, attackRarity) {
  const { list, pieces, totalDR } = armorState(targetActor, type);
  const absorbed = Math.min(damage, totalDR);
  const afterArmor = damage - absorbed;

  const resistance = type
    ? resistanceAgainst(targetActor, type, afterArmor, attackRarity)
    : null;

  const resisted = resistance?.reduction || 0;
  const hpLoss = Math.max(0, afterArmor - resisted);

  return { list, pieces, type, totalDR, absorbed, afterArmor, resistance, resisted, hpLoss };
}

/**
 * Rechnet den Treffer durch, ohne etwas zu schreiben.
 *
 * Bei mehreren Schadenstypen gilt der beste Durchgriff für den Angreifer:
 * es zählt der Typ, bei dem am Ende der meiste Schaden ankommt.
 */
export function resolveDamage(targetActor, rawDamage, options = {}) {
  const { types = [], rarity = "Common" } = options;
  const damage = Math.max(0, Number(rawDamage || 0));
  const candidates = typeList(types);

  const attempts = candidates.length
    ? candidates.map(type => resolveForType(targetActor, damage, type, rarity))
    : [resolveForType(targetActor, damage, null, rarity)];

  const chosen = attempts.reduce((best, attempt) => attempt.hpLoss > best.hpLoss ? attempt : best);

  const currentHP = Number(targetActor?.system?.resources?.hp?.value || 0);
  // Die Rüstung nutzt sich an dem ab, was sie nicht aufhalten konnte —
  // vor der Resistenz, die nicht zur Rüstung gehört.
  const wear = wearArmor(targetActor, chosen.list, chosen.pieces, chosen.afterArmor);

  return {
    damage,
    type: chosen.type,
    typeLabel: chosen.type ? DAMAGE_TYPES[chosen.type] : null,
    consideredTypes: typeLabels(candidates),
    totalDR: chosen.totalDR,
    absorbed: chosen.absorbed,
    afterArmor: chosen.afterArmor,
    resistance: chosen.resistance,
    resisted: chosen.resisted,
    hpLoss: chosen.hpLoss,
    hpBefore: currentHP,
    hpAfter: Math.max(0, currentHP - chosen.hpLoss),
    wear,
    brokenNow: wear.filter(entry => entry.from > 0 && entry.to <= 0)
      .map(entry => chosen.list[entry.index]?.name || "Rüstung")
  };
}

async function applyLocally({ actorUuid, hpLoss, wear }) {
  const actor = await fromUuid(actorUuid);
  if (!actor) return;

  const update = {};

  if (hpLoss > 0) {
    const current = Number(actor.system?.resources?.hp?.value || 0);
    update["system.resources.hp.value"] = Math.max(0, current - hpLoss);
  }

  if (wear?.length) {
    const armors = foundry.utils.duplicate(toArray(actor.system?.armors));
    for (const entry of wear) {
      const armor = armors[entry.index];
      if (!armor) continue;
      armor.durability = Number(armor.durability || 0) - entry.wear;
    }
    update["system.armors"] = armors;
  }

  if (Object.keys(update).length) await actor.update(update);
}

// Nur ein SL wendet an, sonst würde jeder eingeloggte SL denselben Schaden abziehen.
function isApplyingGM() {
  const activeGMs = game.users.filter(u => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id));
  return activeGMs[0]?.id === game.user.id;
}

export async function applyDamage(targetActor, resolved) {
  if (!resolved.hpLoss && !resolved.wear.length) return;

  const payload = {
    actorUuid: targetActor.uuid,
    hpLoss: resolved.hpLoss,
    wear: resolved.wear
  };

  if (targetActor.isOwner) {
    await applyLocally(payload);
  } else if (game.users.some(u => u.isGM && u.active)) {
    game.socket.emit(SOCKET, { action: "applyDamage", payload });
  } else {
    ui.notifications.warn("Kein Spielleiter eingeloggt — der Schaden wurde nicht angewendet.");
  }
}

export function registerDamageSocket() {
  game.socket.on(SOCKET, async (message) => {
    if (message?.action !== "applyDamage") return;
    if (!game.user.isGM || !isApplyingGM()) return;
    await applyLocally(message.payload);
  });
}

export function describeDamage(targetName, resolved) {
  const typeNote = resolved.typeLabel
    ? ` als <strong>${resolved.typeLabel}</strong>` +
      (resolved.consideredTypes.length > 1
        ? ` <span style="font-size:11px;">(bester Durchgriff aus ${resolved.consideredTypes.join(", ")})</span>`
        : "")
    : "";

  let text =
    `<p style="margin:6px 0 0 0;">🛡️ <strong>${targetName}</strong> nimmt ` +
    `<strong>${resolved.hpLoss}</strong> Schaden${typeNote}<br>` +
    `<span style="font-size:11px;">${resolved.damage} Schaden − ${resolved.totalDR} DR` +
    (resolved.resisted ? ` − ${resolved.resisted} Resistenz` : "") +
    ` · HP: ${resolved.hpBefore} → ${resolved.hpAfter}</span></p>`;

  if (resolved.resistance) {
    const r = resolved.resistance;
    text +=
      `<p style="margin:2px 0 0 0; font-size:11px;">` +
      `Resistenz <strong>${r.name}</strong> (${r.rarity}${r.general ? ", allgemein" : ""}): ` +
      `Level ${r.level} × Stufe ${r.rank}${r.general ? " − 1" : ""} = ${r.raw}, ` +
      `Deckel ${r.cap} → <strong>${r.reduction}</strong> absorbiert</p>`;
  }

  if (resolved.wear.length) {
    const parts = resolved.wear.map(entry => `Haltbarkeit ${entry.from} → ${entry.to}`).join(", ");
    text += `<p style="margin:2px 0 0 0; font-size:11px;">Rüstung nutzt sich ab: ${parts}</p>`;
  }

  if (resolved.brokenNow.length) {
    text += `<p style="margin:2px 0 0 0;"><strong>Unbrauchbar: ${resolved.brokenNow.join(", ")}</strong></p>`;
  }

  return text;
}
