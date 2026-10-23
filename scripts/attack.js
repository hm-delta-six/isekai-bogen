import { describeDamage, payCosts, prepareDamage, resolveDamage } from "./damage.js";
import { placeTemplate } from "./area-template.js";
import { HIT_COVERAGE, templateCoverage, templateShape } from "./area.js";
import { COST_TYPES, MOD_BONUS_TYPES, areaSetting, machtfaktor, modBonus, rarityRank, summarizeMods, toArray, typeLabels } from "./rules.js";

// Boni aus Titeln und Ausrüstung für einen Typ (STR, AW, VW, ...) summieren.
// Ausrüstung trägt derzeit keine type/bonus-Felder, wird aber mitgelesen,
// damit spätere Felder ohne Codeänderung greifen.
function bonusForType(actor, type) {
  const sum = (list) => toArray(list)
    .reduce((acc, entry) => (entry?.type === type ? acc + Number(entry.bonus || 0) : acc), 0);
  return sum(actor?.system?.titles) + sum(actor?.system?.equipment);
}

function effectiveAttribute(actor, key) {
  const attr = String(key || "STR").toUpperCase();
  return Number(actor?.system?.abilities?.[attr]?.value || 0) + bonusForType(actor, attr);
}

function usableWeapons(actor) {
  return toArray(actor?.system?.weapons)
    .map((weapon, index) => ({ weapon, index }))
    .filter(entry => entry.weapon && typeof entry.weapon === "object" &&
      (entry.weapon.name || entry.weapon.dice || entry.weapon.attribute));
}

// Die Waffe verweist per Namen auf einen Skill des Charakters. Von dort kommen
// Skill-Level und steuerndes Attribut — so gilt eine Skill-Steigerung sofort,
// ohne das Level an der Waffe nachzupflegen.
export function weaponSkill(actor, weapon) {
  const wanted = String(weapon?.skillName || "").trim().toLowerCase();
  if (!wanted) return { level: 0, attribute: "STR", name: null, missing: false };

  const found = toArray(actor?.system?.isekaiSkills)
    .find(skill => String(skill?.name || "").trim().toLowerCase() === wanted);

  if (!found) return { level: 0, attribute: "STR", name: weapon.skillName, missing: true };

  return {
    level: Number(found.level || 0),
    attribute: found.attribute || "STR",
    name: found.name,
    missing: false
  };
}

export function attackValue(actor, weapon) {
  const skill = weaponSkill(actor, weapon);
  return 10 +
    Number(actor.system?.boni?.awSkill || 0) +
    skill.level +
    effectiveAttribute(actor, skill.attribute) +
    Number(actor.system?.boni?.aw || 0) + bonusForType(actor, "AW") +
    Number(weapon.bonus || 0);
}

// Schaden = Würfel × Machtfaktor + Attribut + halber AW-Skill + Waffen-Skill + Bonus
// Das Attribut ist das des verknüpften Skills, ohne Verknüpfung STR.
export function damageBonus(actor, weapon) {
  const skill = weaponSkill(actor, weapon);
  return effectiveAttribute(actor, skill.attribute) +
    Math.ceil(Number(actor?.system?.boni?.awSkill || 0) / 2) +
    skill.level +
    Number(weapon?.bonus || 0);
}

function attackBreakdown(actor, weapon) {
  const skill = weaponSkill(actor, weapon);
  const parts = [
    `10`,
    `AW-Skill ${Number(actor.system?.boni?.awSkill || 0)}`,
    `${skill.name ? `${skill.name} ` : "Waffen-Skill "}${skill.level}`,
    `${skill.attribute} ${effectiveAttribute(actor, skill.attribute)}`
  ];
  const general = Number(actor.system?.boni?.aw || 0) + bonusForType(actor, "AW");
  if (general) parts.push(`Boni ${general}`);
  if (Number(weapon.bonus || 0)) parts.push(`Waffenbonus ${Number(weapon.bonus)}`);
  return parts.join(" + ") + (skill.missing ? ` — Skill "${skill.name}" nicht im Bogen, als 0 gewertet` : "");
}

// Der Bogen schreibt den fertigen VW nach system.attributes.vw.value.
// boni.vw ist nur der Zuschlag und taugt nicht als Gesamtwert.
function defenceValue(targetActor) {
  const base = Number(targetActor?.system?.attributes?.vw?.value || 0) || 10;
  return base + bonusForType(targetActor, "VW");
}

const hitChanceFor = (aw, vw) => Math.max(5, Math.min(95, Math.round(50 * (aw / vw))));

/**
 * Modifikations-Skills einer Waffe mit aufgelöster Bonushöhe und der Frage,
 * ob der Charakter die Kosten gerade tragen kann.
 */
export function weaponMods(actor, weapon) {
  return toArray(weapon?.mods).map((mod, index) => {
    const skill = toArray(actor?.system?.isekaiSkills).find(entry =>
      String(entry?.name || "").trim().toLowerCase() ===
      String(mod?.skillName || "").trim().toLowerCase());

    const bonusType = mod?.bonusType in MOD_BONUS_TYPES ? mod.bonusType : "aw";
    const costType = mod?.costType in COST_TYPES ? mod.costType : "mp";
    const costValue = Math.max(0, Number(mod?.costValue || 0));
    const available = Number(actor?.system?.resources?.[costType]?.value || 0);

    return {
      index,
      name: skill?.name || mod?.skillName || "Ohne Skill",
      bonusType,
      // Bei "Anzahl Gegner" zaehlt hoechstens die Raritaetsstufe des Skills,
      // sonst waeren es Level x Stufe zusaetzliche Ziele.
      bonus: !skill ? 0
        : bonusType === "targets" ? Math.min(modBonus(skill), rarityRank(skill.rarity))
        : modBonus(skill),
      capped: Boolean(skill) && bonusType === "targets" && modBonus(skill) > rarityRank(skill.rarity),
      costType,
      costValue,
      available,
      affordable: costValue <= available,
      missing: Boolean(mod?.skillName) && !skill
    };
  }).filter(mod => mod.name !== "Ohne Skill" || mod.bonus);
}

// Bereich einer Waffe: Modus, zulässige und gewählte Größe, AW-Malus.
export function weaponArea(actor, weapon) {
  return areaSetting(
    weapon?.areaMode || "single",
    weapon?.rarity,
    weaponSkill(actor, weapon).level,
    weapon?.areaSize
  );
}

export function areaDescription(area) {
  const reduced = area.malus ? ` (von max. ${area.max}, AW −${area.malus})` : "";
  switch (area.mode) {
    case "marked": return `Markierte Gegner, bis zu ${area.size}`;
    case "cone":   return `Kegel, ${area.size} Kästchen lang${reduced}`;
    case "circle": return `Kreis, ${area.size} Kästchen Durchmesser${reduced}`;
    case "line":   return `Linie, ${area.size} Kästchen lang, 1 breit${reduced}`;
    default:       return "Einzelangriff";
  }
}

// Markierte Tokens ohne den Angreifer selbst.
function markedTargets(actor) {
  return Array.from(game.user.targets ?? []).filter(token => token?.actor && token.actor.id !== actor.id);
}

function infoHtml(actor, weapon, targets) {
  const area = weaponArea(actor, weapon);
  const aw = attackValue(actor, weapon) - area.malus;
  const breakdown = attackBreakdown(actor, weapon) + (area.malus ? ` − Flächenmalus ${area.malus}` : "");

  let html =
    `<p>⚔️ <strong>Dein AW:</strong> ${aw}<br><span style="font-size: 11px;">${breakdown}</span></p>` +
    `<p>📐 <strong>Bereich:</strong> ${areaDescription(area)}</p>`;

  if (area.mode === "single") {
    const target = targets[0];
    const vw = target ? defenceValue(target.actor) : 10;
    html +=
      `<p>🛡️ <strong>Ziel (${target?.name || "Ziel"}) VW:</strong> ${vw}</p>` +
      `<p>🎯 <strong>Trefferchance:</strong> ${hitChanceFor(aw, vw)}% (Min 5% / Max 95%)</p>`;
  } else if (area.mode === "marked") {
    if (!targets.length) {
      html += `<p><strong>Kein Gegner markiert.</strong></p>`;
    } else if (targets.length > area.size) {
      html += `<p><strong>${targets.length} Ziele markiert, erlaubt sind ${area.size}.</strong></p>`;
    } else {
      html += `<p>🎯 ${targets.map(t => `${t.name} ${hitChanceFor(aw, defenceValue(t.actor))}%`).join(" · ")}</p>`;
    }
  } else {
    html += `<p style="font-size: 11px;">Getroffen ist, wer mindestens zur Hälfte in der Fläche steht. ` +
      `Die Trefferchance wird je Ziel gegen dessen VW berechnet.</p>`;
  }

  const mods = weaponMods(actor, weapon);
  if (mods.length) {
    html += `<p style="margin-bottom:2px;"><strong>Modifikations-Skills</strong></p>`;
    for (const mod of mods) {
      const cost = mod.costValue ? `${mod.costValue} ${COST_TYPES[mod.costType]}` : "keine Kosten";
      const note = mod.missing
        ? " — Skill nicht im Bogen"
        : mod.capped ? " — auf die Raritätsstufe begrenzt"
        : (mod.affordable ? "" : ` — nur ${mod.available} ${COST_TYPES[mod.costType]} vorhanden`);
      html +=
        `<label style="display:flex; align-items:center; gap:6px; font-size:11px;">` +
        `<input type="checkbox" name="mod" value="${mod.index}" style="width:auto; margin:0;"` +
        `${mod.affordable && !mod.missing ? "" : " disabled"}/>` +
        `<span>${mod.name}: +${mod.bonus} ${MOD_BONUS_TYPES[mod.bonusType]}, ${cost}${note}</span></label>`;
    }
  }

  return html;
}

function buildDialogContent(actor, entries, selectedIndex, targets) {
  const options = entries.map(({ weapon, index }) =>
    `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>` +
    `${weapon.name || `Waffe ${index + 1}`} (${weapon.rarity || "Common"})</option>`).join("");

  const selected = entries.find(e => e.index === selectedIndex).weapon;

  return `
    <form>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px; font-weight: bold;">Waffe wählen:</label>
        <select name="weapon" style="width: 100%;">${options}</select>
      </div>
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-weight: bold;">Wurf-Modus:</label>
        <select name="mode" style="width: 100%;">
          <option value="normal">Normal</option>
          <option value="advantage">Vorteil (2x würfeln, besserer Wurf)</option>
          <option value="disadvantage">Nachteil (2x würfeln, schlechterer Wurf)</option>
        </select>
      </div>
      <div class="attack-info" style="font-size: 12px;">${infoHtml(actor, selected, targets)}</div>
      <p style="font-size: 11px; margin-top: 8px;">Jedes Ziel bekommt einen eigenen Angriffs- und Schadenswurf.</p>
    </form>
  `;
}

async function rollAttack(mode) {
  const first = await new Roll("1d100").evaluate({ async: true });
  if (mode === "normal") {
    return { value: first.total, rolls: [first], label: `🎲 <strong>Angriffswurf:</strong> <b>${first.total}</b>` };
  }

  const second = await new Roll("1d100").evaluate({ async: true });
  const [a, b] = [first.total, second.total];
  const advantage = mode === "advantage";
  const value = advantage ? Math.min(a, b) : Math.max(a, b);
  const name = advantage ? "Vorteil" : "Nachteil";
  const pick = advantage ? "Bester" : "Schlechtester";

  return {
    value,
    rolls: [first, second],
    label: `🎲 <strong>Angriffswurf (${name}):</strong> [${a}, ${b}] = <b>${value}</b> (${pick})`
  };
}

/**
 * Welche Tokens der Angriff trifft. Gibt null zurück, wenn abgebrochen wurde
 * oder die Voraussetzungen fehlen — der Hinweis steht dann schon auf dem Schirm.
 */
async function selectVictims(actor, area) {
  const targets = markedTargets(actor);

  if (area.mode === "single") return targets.slice(0, 1);

  if (area.mode === "marked") {
    if (!targets.length) {
      ui.notifications.warn("Kein Gegner markiert.");
      return null;
    }
    if (targets.length > area.size) {
      ui.notifications.warn(`${targets.length} Ziele markiert, erlaubt sind ${area.size}. Bitte Markierung anpassen.`);
      return null;
    }
    return targets;
  }

  const dimensions = canvas.dimensions;
  const shape = templateShape(area.mode, area.size, dimensions.distance, dimensions.size);
  if (!shape) return [];

  const placed = await placeTemplate({
    t: shape.t,
    distance: shape.units,
    angle: shape.angle,
    width: shape.width?.units
  });
  if (!placed) {
    ui.notifications.info("Angriff abgebrochen.");
    return null;
  }

  const geometry = {
    t: shape.t,
    x: placed.x,
    y: placed.y,
    direction: placed.direction,
    distance: shape.pixels,
    angle: shape.angle,
    width: shape.width?.pixels
  };

  return canvas.tokens.placeables.filter(token =>
    token?.actor &&
    token.actor.id !== actor.id &&
    templateCoverage(geometry, { x: token.x, y: token.y, w: token.w, h: token.h }) >= HIT_COVERAGE);
}

/**
 * Angriffsdialog öffnen. Ohne `weapon` steht die Waffenauswahl auf der zuletzt
 * benutzten Waffe — so lässt sich derselbe Ablauf aus dem Bogen und aus der
 * Makroleiste auslösen. Ob einzeln, gegen markierte Gegner oder in einer
 * Fläche angegriffen wird, bestimmt die Waffe selbst.
 */
export async function executeAttack(actor, weapon = null) {
  const entries = usableWeapons(actor);
  if (!entries.length) {
    return ui.notifications.warn("Dieser Charakter hat keine gültigen Waffen in seiner Liste!");
  }

  const remembered = Number(actor.getFlag("isekai-bogen", "lastWeaponIndex") || 0);
  const requested = weapon ? entries.find(e => e.weapon === weapon)?.index : remembered;
  const selectedIndex = entries.some(e => e.index === requested) ? requested : entries[0].index;

  const targets = markedTargets(actor);

  new Dialog({
    title: `Angriff von ${actor.name}`,
    content: buildDialogContent(actor, entries, selectedIndex, targets),
    render: (html) => {
      html.find('select[name="weapon"]').change(ev => {
        const chosen = entries.find(e => e.index === Number(ev.currentTarget.value));
        if (chosen) html.find(".attack-info").html(infoHtml(actor, chosen.weapon, targets));
      });
    },
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: "Angreifen",
        callback: async (html) => {
          const index = Number(html.find('select[name="weapon"]').val());
          const mode = html.find('select[name="mode"]').val();
          const chosen = entries.find(e => e.index === index);
          if (!chosen) return;

          await actor.setFlag("isekai-bogen", "lastWeaponIndex", index);

          const picked = html.find('input[name="mod"]:checked').map((_, el) => Number(el.value)).get();
          const chosenMods = weaponMods(actor, chosen.weapon).filter(mod => picked.includes(mod.index));

          await resolveAttack(actor, chosen.weapon, mode, chosenMods);
        }
      }
    },
    default: "roll"
  }).render(true);
}

async function resolveAttack(actor, used, mode, mods = []) {
  const { bonus, cost } = summarizeMods(mods);

  // Reichweite vergroessert die Flaeche, Anzahl Gegner die Zahl der Ziele.
  // Ein Ziel-Bonus auf einer Einzelangriffs-Waffe macht daraus einen Angriff
  // auf markierte Gegner — sonst bliebe ein Rundumschlag wirkungslos.
  const base = weaponArea(actor, used);
  let area = { ...base };

  if (bonus.targets > 0) {
    area = base.mode === "single"
      ? { ...base, mode: "marked", max: 1 + bonus.targets, size: 1 + bonus.targets }
      : { ...base, size: base.size + bonus.targets };
  } else if (base.size !== null) {
    area = { ...base, size: base.size + bonus.range };
  }

  const victims = await selectVictims(actor, area);
  if (victims === null) return;

  const aw = attackValue(actor, used) - area.malus + bonus.aw;

  const factor = machtfaktor(used.rarity);
  const skill = weaponSkill(actor, used);
  const attributeValue = effectiveAttribute(actor, skill.attribute);
  const halfAwSkill = Math.ceil(Number(actor.system?.boni?.awSkill || 0) / 2);
  const weaponBonus = Number(used.bonus || 0);
  const diceType = used.dice || "1d6";
  const damageFormula = `(${diceType} * ${factor}) + ${damageBonus(actor, used) + bonus.damage}`;

  // Ohne Ziel wird beim Einzelangriff wie bisher gegen VW 10 geprüft,
  // damit der Wurf auch ohne markierten Token am Tisch nutzbar bleibt.
  const checks = victims.length || area.mode !== "single"
    ? victims.map(token => ({ token, vw: defenceValue(token.actor) }))
    : [{ token: null, vw: 10 }];

  const title = area.mode === "single"
    ? `Angriff mit ${used.name} auf ${checks[0]?.token?.name || "Ziel"}`
    : `${areaDescription(area).split(",")[0]} mit ${used.name}`;

  let content =
    `🎯 <strong>${title}</strong><br>` +
    (area.mode === "single" ? "" : `<small>${areaDescription(area)}</small><br>`) +
    `<small>AW ${aw} = ${attackBreakdown(actor, used)}${area.malus ? ` − Flächenmalus ${area.malus}` : ""}</small><br>` +
    `<small>Schaden: ${diceType} × Machtfaktor ${factor} + ${skill.attribute} (${attributeValue}) ` +
    `+ Halber AW-Skill (${halfAwSkill}) + ${skill.name || "Waffen-Skill"} (${skill.level}) + Bonus (${weaponBonus})` +
    (typeLabels(used.damageTypes).length ? ` · ${typeLabels(used.damageTypes).join(", ")}` : "") +
    `</small>`;

  if (mods.length) {
    content += `<br><small>Modifikationen: ` + mods.map(mod =>
      `${mod.name} (+${mod.bonus} ${MOD_BONUS_TYPES[mod.bonusType]}` +
      (mod.costValue ? `, ${mod.costValue} ${COST_TYPES[mod.costType]}` : "") + `)`).join(", ") + `</small>`;
    await payCosts(actor, cost);
  }

  if (!checks.length) {
    content += `<hr><span style="font-size: 11px;">Niemand steht mindestens zur Hälfte in der Fläche.</span>`;
  }

  // Jedes Ziel bekommt eigenen Angriffs- und Schadenswurf, damit Gegner
  // unterschiedlich getroffen werden können.
  const rolls = [];
  const pendingDamage = [];
  for (const check of checks) {
    const name = check.token?.name || "Ziel";
    const chance = hitChanceFor(aw, check.vw);
    const attack = await rollAttack(mode);
    const isHit = attack.value <= chance;
    rolls.push(...attack.rolls);

    content += `<hr><strong>${name}</strong> — VW ${check.vw}, Chance ${chance}%<br>` +
      `${attack.label} → ${isHit ? "<strong>TREFFER</strong>" : "<strong>verfehlt</strong>"}`;

    if (!isHit) continue;

    const damageRoll = await new Roll(damageFormula).evaluate({ async: true });
    rolls.push(damageRoll);

    content += `<br>💥 <strong>Schaden:</strong> ` +
      `<span style="font-size: 20px; font-weight: bold;">${damageRoll.total}</span> ` +
      `<small>(${damageRoll.result})</small>`;

    if (!check.token) continue;

    const resolved = resolveDamage(check.token.actor, damageRoll.total, {
      types: used.damageTypes,
      rarity: used.rarity
    });
    content += describeDamage(name, resolved);

    const pending = await prepareDamage(check.token.actor, resolved);
    if (pending) pendingDamage.push(pending);
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    // Der SL liest das beim Eintreffen der Nachricht und zieht ab.
    flags: pendingDamage.length ? { "isekai-bogen": { pendingDamage } } : {}
  });
}

// Einstieg für die Makroleiste: gewählter Token, sonst der eigene Charakter.
export function attackFromMacro() {
  const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
  if (!actor) return ui.notifications.warn("Bitte wähle zuerst einen Token aus!");
  return executeAttack(actor);
}
