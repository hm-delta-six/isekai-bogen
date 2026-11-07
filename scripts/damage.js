import {
  DAMAGE_TYPES, damageReduction, resistanceSources, toArray, typeLabels, typeList
} from "./rules.js";

const MODULE_ID = "isekai-bogen";
const SOCKET = `module.${MODULE_ID}`;

export const ARMOR_WEAR_CHOICES = {
  highest: "Teil mit der höchsten DR nutzt sich ab",
  spread: "Abnutzung auf alle intakten Teile verteilen"
};

export const isIntact = (armor) => Number(armor?.durability || 0) > 0;

/**
 * Schadensarten und Ersetzungen stehen im Skill-Baum. Den liefert die
 * Oberflaeche nach, damit dieses Modul ohne Foundry testbar bleibt.
 */
let lookupSource = null;
export const useSkillLookup = (getter) => { lookupSource = getter; };
export const skillLookup = () => (typeof lookupSource === "function" ? lookupSource() : null);

/**
 * HP, MP und AP liegen unter system.isekai. system.resources gehoert pf1 und
 * laesst dessen Datenvorbereitung bei fremden Schluesseln abstuerzen; der
 * Fallback liest alte Boegen, die noch nicht migriert sind.
 */
export const currentPool = (actor, key) =>
  Number(actor?.system?.isekai?.[key]?.value ?? actor?.system?.resources?.[key]?.value ?? 0);

// Ein Rüstungsteil ohne gewählte Typen schützt gegen alles. Das hält alte
// Einträge gültig, die vor der Typenauswahl angelegt wurden.
function armorCovers(armor, type) {
  const types = typeList(armor?.types);
  if (!types.length) return true;
  return !type || types.includes(type);
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
 * Resistenz gegen einen Schadenstyp: Summe aus allen passenden Resistenzen,
 * jede mit Skill-Level × Machtfaktor der Raritätsstufe. Kein Deckel und kein
 * Unterschied zwischen allgemeinen und spezialisierten Resistenzen — es gibt
 * genau diese eine Formel, und mehrere Resistenzen addieren sich.
 *
 * Bedingte Resistenzen (nur gegen Magie, nur gegen Gift) zählen hier nicht:
 * ein Angriff bringt im Modul keine Quelle mit. Sie stehen im Bogen.
 */
export function resistanceAgainst(actor, type, lookup = skillLookup()) {
  if (!type) return { value: 0, entries: [] };

  const reduction = damageReduction({
    resistances: resistanceSources({
      resistances: actor?.system?.resistances,
      skills: actor?.system?.isekaiSkills,
      lookup
    })
  });

  return {
    value: reduction.flat[type] || 0,
    entries: reduction.active.filter(entry => !entry.cond && entry.types.includes(type))
  };
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
function resolveForType(targetActor, damage, type, lookup) {
  const { list, pieces, totalDR } = armorState(targetActor, type);
  const absorbed = Math.min(damage, totalDR);
  const afterArmor = damage - absorbed;

  const resistance = type ? resistanceAgainst(targetActor, type, lookup) : null;

  const resisted = Math.min(afterArmor, resistance?.value || 0);
  const hpLoss = afterArmor - resisted;

  return { list, pieces, type, totalDR, absorbed, afterArmor, resistance, resisted, hpLoss };
}

/**
 * Rechnet den Treffer durch, ohne etwas zu schreiben.
 *
 * Bei mehreren Schadenstypen gilt der beste Durchgriff für den Angreifer:
 * es zählt der Typ, bei dem am Ende der meiste Schaden ankommt.
 */
export function resolveDamage(targetActor, rawDamage, options = {}) {
  const { types = [], lookup = skillLookup() } = options;
  const damage = Math.max(0, Number(rawDamage || 0));
  const candidates = typeList(types);

  const attempts = candidates.length
    ? candidates.map(type => resolveForType(targetActor, damage, type, lookup))
    : [resolveForType(targetActor, damage, null, lookup)];

  const chosen = attempts.reduce((best, attempt) => attempt.hpLoss > best.hpLoss ? attempt : best);

  const currentHP = currentPool(targetActor, "hp");
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
    update["system.isekai.hp.value"] = Math.max(0, currentPool(actor, "hp") - hpLoss);
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

/**
 * Spieler duerfen fremde Akteure nicht aendern, der Abzug muss also ueber den
 * SL laufen. Statt einer eigenen Socket-Nachricht haengt er an der
 * Chatnachricht des Angriffs: deren Zustellung an alle Clients garantiert
 * Foundry selbst, waehrend ein eigener Socket-Listener still fehlen kann.
 *
 * Gibt den Eintrag zurueck, der an die Chatnachricht gehaengt werden muss,
 * oder null, wenn der Schaden bereits angewendet wurde.
 */
export async function prepareDamage(targetActor, resolved) {
  if (!resolved.hpLoss && !resolved.wear.length) return null;

  const entry = {
    actorUuid: targetActor.uuid,
    targetName: targetActor.name,
    hpLoss: resolved.hpLoss,
    wear: resolved.wear
  };

  if (targetActor.isOwner) {
    console.debug(`${MODULE_ID} | Schaden direkt angewendet`, entry);
    await applyLocally(entry);
    return null;
  }

  if (!game.users.some(u => u.isGM && u.active)) {
    ui.notifications.warn("Kein Spielleiter eingeloggt — der Schaden wurde nicht angewendet.");
    return null;
  }

  console.debug(`${MODULE_ID} | Schaden wird dem SL mitgegeben`, entry);
  return entry;
}

// Nur ein SL wendet an, sonst wuerde jeder eingeloggte SL denselben Schaden abziehen.
function isApplyingGM() {
  const activeGMs = game.users.filter(u => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id));
  return activeGMs[0]?.id === game.user.id;
}

export function registerDamageHooks() {
  Hooks.on("createChatMessage", async (message) => {
    if (!game.user.isGM || !isApplyingGM()) return;

    const pending = message.getFlag(MODULE_ID, "pendingDamage");
    if (!Array.isArray(pending) || !pending.length) return;
    if (message.getFlag(MODULE_ID, "damageApplied")) return;

    console.debug(`${MODULE_ID} | wende ${pending.length} Schadenseintrag/eintraege an`, pending);

    for (const entry of pending) {
      try {
        await applyLocally(entry);
      } catch (error) {
        console.error(`${MODULE_ID} | Schaden konnte nicht angewendet werden`, error, entry);
        ui.notifications.error(`Schaden an ${entry?.targetName ?? "Ziel"} fehlgeschlagen: ${error.message}`);
      }
    }

    // Verhindert ein zweites Anwenden, falls die Nachricht erneut erzeugt wird.
    await message.setFlag(MODULE_ID, "damageApplied", true);
  });

  console.debug(`${MODULE_ID} | Schadens-Hook aktiv, GM: ${game.user.isGM}`);
}

/**
 * Zieht die Kosten eines Modifikations-Skills ab. Betrifft immer den eigenen
 * Akteur, laeuft also ohne Umweg ueber den SL.
 */
export async function payCosts(actor, cost) {
  const update = {};
  for (const [key, amount] of Object.entries(cost || {})) {
    if (!amount) continue;
    update[`system.isekai.${key}.value`] = Math.max(0, currentPool(actor, key) - amount);
  }
  if (Object.keys(update).length) await actor.update(update);
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

  if (resolved.resistance?.entries?.length) {
    const parts = resolved.resistance.entries
      .map(entry => `${entry.name} ${entry.value}`)
      .join(" + ");
    text +=
      `<p style="margin:2px 0 0 0; font-size:11px;">` +
      `Resistenz: ${parts} = <strong>${resolved.resistance.value}</strong>` +
      (resolved.resisted < resolved.resistance.value ? ` (${resolved.resisted} genutzt)` : "") +
      `</p>`;
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
