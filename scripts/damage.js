const MODULE_ID = "isekai-bogen";
const SOCKET = `module.${MODULE_ID}`;

export const ARMOR_WEAR_CHOICES = {
  highest: "Teil mit der höchsten DR nutzt sich ab",
  spread: "Abnutzung auf alle intakten Teile verteilen"
};

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
};

export const isIntact = (armor) => Number(armor?.durability || 0) > 0;

// Alle intakten Rüstungsteile zählen, kaputte geben keine DR mehr.
export function armorState(actor) {
  const list = toArray(actor?.system?.armors);
  const pieces = list
    .map((armor, index) => ({ index, armor }))
    .filter(entry => entry.armor && isIntact(entry.armor));

  const totalDR = pieces.reduce((sum, entry) => sum + Number(entry.armor.dr || 0), 0);
  return { list, pieces, totalDR };
}

// Verteilt den Verschleiß nach der im Bogen gewählten Regel.
// Gibt eine Liste { index, from, to } zurück, damit der Chat sie anzeigen kann.
function wearArmor(actor, list, pieces, wearAmount) {
  if (wearAmount <= 0 || !pieces.length) return [];

  const rule = actor?.system?.armorWear === "spread" ? "spread" : "highest";
  const changes = [];

  if (rule === "highest") {
    const target = pieces.reduce((best, entry) =>
      Number(entry.armor.dr || 0) > Number(best.armor.dr || 0) ? entry : best);
    changes.push({ index: target.index, wear: wearAmount });
  } else {
    // Rest wird auf die vorderen Teile verteilt, damit die Summe exakt stimmt.
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

// Rechnet den Treffer durch, ohne etwas zu schreiben.
// Wird auf dem Client des Angreifers ausgeführt, damit die Chatausgabe
// dieselben Zahlen zeigt, die anschließend angewendet werden.
export function resolveDamage(targetActor, rawDamage) {
  const { list, pieces, totalDR } = armorState(targetActor);
  const damage = Math.max(0, Number(rawDamage || 0));
  const absorbed = Math.min(damage, totalDR);
  const hpLoss = damage - absorbed;

  const currentHP = Number(targetActor?.system?.resources?.hp?.value || 0);
  const wear = wearArmor(targetActor, list, pieces, hpLoss);

  return {
    damage,
    totalDR,
    absorbed,
    hpLoss,
    hpBefore: currentHP,
    hpAfter: Math.max(0, currentHP - hpLoss),
    wear,
    brokenNow: wear.filter(entry => entry.from > 0 && entry.to <= 0)
      .map(entry => list[entry.index]?.name || "Rüstung")
  };
}

// Deltas statt fester Werte, damit gleichzeitige Treffer sich nicht überschreiben.
async function applyLocally({ actorUuid, hpLoss, wear }) {
  const actor = await fromUuid(actorUuid);
  if (!actor) return;

  const update = {};

  if (hpLoss > 0) {
    const current = Number(actor.system?.resources?.hp?.value || 0);
    const next = Math.max(0, current - hpLoss);
    update["system.resources.hp.value"] = next;
    // Spiegel für pf1-Interna und Token-Balken, die auf attributes.hp zeigen.
    update["system.attributes.hp.value"] = next;
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
  const payload = {
    actorUuid: targetActor.uuid,
    hpLoss: resolved.hpLoss,
    wear: resolved.wear
  };

  if (!resolved.hpLoss && !resolved.wear.length) return;

  // Eigene Akteure direkt, fremde über den SL-Client.
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
  let text =
    `<p style="margin:6px 0 0 0;">🛡️ <strong>${targetName}</strong> nimmt ` +
    `<strong>${resolved.hpLoss}</strong> Schaden ` +
    `<span style="font-size:11px;">(${resolved.damage} Schaden − ${resolved.totalDR} DR)</span><br>` +
    `<span style="font-size:11px;">HP: ${resolved.hpBefore} → ${resolved.hpAfter}</span></p>`;

  if (resolved.wear.length) {
    const parts = resolved.wear
      .map(entry => `Haltbarkeit ${entry.from} → ${entry.to}`)
      .join(", ");
    text += `<p style="margin:2px 0 0 0; font-size:11px;">Rüstung nutzt sich ab: ${parts}</p>`;
  }

  if (resolved.brokenNow.length) {
    text += `<p style="margin:2px 0 0 0;"><strong>Unbrauchbar: ${resolved.brokenNow.join(", ")}</strong></p>`;
  }

  return text;
}
