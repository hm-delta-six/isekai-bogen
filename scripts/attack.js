import { applyDamage, describeDamage, resolveDamage } from "./damage.js";
import { placeTemplate, tokensInTemplate } from "./area-template.js";
import { machtfaktor, toArray, typeLabels } from "./rules.js";

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

function buildDialogContent(actor, entries, selectedIndex, targetName, targetVW) {
  const options = entries.map(({ weapon, index }) =>
    `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>` +
    `${weapon.name || `Waffe ${index + 1}`} (${weapon.rarity || "Common"})</option>`).join("");

  const selected = entries.find(e => e.index === selectedIndex).weapon;
  const aw = attackValue(actor, selected);
  const breakdown = attackBreakdown(actor, selected);

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
      <div style="font-size: 12px;">
        <p>⚔️ <strong>Dein AW:</strong> <span class="display-aw">${aw}</span><br>
          <span style="font-size: 11px;" class="display-breakdown">${breakdown}</span></p>
        <p>🛡️ <strong>Ziel (${targetName}) VW:</strong> ${targetVW}</p>
        <p style="margin-top: 4px;">🎯 <strong>Trefferchance:</strong>
          <span class="display-chance">${hitChanceFor(aw, targetVW)}</span>% (Min 5% / Max 95%)</p>
      </div>
      <p style="font-size: 11px; margin-top: 8px;">Es wird ein W100 gewürfelt.</p>
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
 * Angriffsdialog öffnen. Ohne `weapon` steht die Waffenauswahl auf der zuletzt
 * benutzten Waffe — so lässt sich derselbe Ablauf aus dem Bogen und aus der
 * Makroleiste auslösen.
 */
export async function executeAttack(actor, weapon = null) {
  const entries = usableWeapons(actor);
  if (!entries.length) {
    return ui.notifications.warn("Dieser Charakter hat keine gültigen Waffen in seiner Liste!");
  }

  const remembered = Number(actor.getFlag("isekai-bogen", "lastWeaponIndex") || 0);
  const requested = weapon ? entries.find(e => e.weapon === weapon)?.index : remembered;
  const selectedIndex = entries.some(e => e.index === requested) ? requested : entries[0].index;

  const targetedToken = game.user.targets.first();
  const targetActor = targetedToken?.actor;
  const targetName = targetedToken?.name || "Ziel";
  const targetVW = targetActor ? defenceValue(targetActor) : 10;

  new Dialog({
    title: `Angriff von ${actor.name}`,
    content: buildDialogContent(actor, entries, selectedIndex, targetName, targetVW),
    render: (html) => {
      html.find('select[name="weapon"]').change(ev => {
        const chosen = entries.find(e => e.index === Number(ev.currentTarget.value));
        if (!chosen) return;
        const aw = attackValue(actor, chosen.weapon);
        html.find(".display-aw").text(aw);
        html.find(".display-breakdown").text(attackBreakdown(actor, chosen.weapon));
        html.find(".display-chance").text(hitChanceFor(aw, targetVW));
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

          const used = chosen.weapon;
          const aw = attackValue(actor, used);
          const chance = hitChanceFor(aw, targetVW);

          const attack = await rollAttack(mode);
          const isHit = attack.value <= chance;

          const factor = machtfaktor(used.rarity);
          const skill = weaponSkill(actor, used);
          const attributeValue = effectiveAttribute(actor, skill.attribute);
          const halfAwSkill = Math.ceil(Number(actor.system?.boni?.awSkill || 0) / 2);
          const weaponBonus = Number(used.bonus || 0);
          const flatBonus = damageBonus(actor, used);
          const diceType = used.dice || "1d6";

          const damageRoll = await new Roll(`(${diceType} * ${factor}) + ${flatBonus}`).evaluate({ async: true });

          let content =
            `🎯 <strong>Angriff mit ${used.name} auf ${targetName}</strong><br>` +
            (isHit
              ? `<strong>TREFFER! (W100: ${attack.value} vs. Chance: ${chance}%)</strong>`
              : `<strong>VERFEHLT! (W100: ${attack.value} vs. Chance: ${chance}%)</strong>`) +
            `<br><br>${attack.label}` +
            `<br><small>AW ${aw} = ${attackBreakdown(actor, used)}</small>`;

          if (!targetedToken || isHit) {
            content += `<hr>` +
              `💥 <strong>Schaden (${used.name}):</strong><br>` +
              `<span style="font-size: 26px; font-weight: bold; line-height: 1.2;">${damageRoll.total}</span><br>` +
              (typeLabels(used.damageTypes).length
                ? `<br><small>Schadensart: ${typeLabels(used.damageTypes).join(", ")}</small>` : "") +
              `<small>Rechenweg: (${damageRoll.result}) [${diceType} × Machtfaktor ${factor}] ` +
              `+ ${skill.attribute} (${attributeValue}) + Halber AW-Skill (${halfAwSkill}) ` +
              `+ ${skill.name || "Waffen-Skill"} (${skill.level}) + Bonus (${weaponBonus})</small>`;
          } else {
            content += `<br><span style="font-size: 11px;">(Kein Schaden, da verfehlt)</span>`;
          }

          // DR abziehen, Rest von den HP, Überschuss von der Haltbarkeit
          if (targetActor && isHit) {
            const resolved = resolveDamage(targetActor, damageRoll.total, {
              types: used.damageTypes,
              rarity: used.rarity
            });
            content += `<hr>` + describeDamage(targetName, resolved);
            await applyDamage(targetActor, resolved);
          }

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            rolls: [...attack.rolls, damageRoll]
          });
        }
      }
    },
    default: "roll"
  }).render(true);
}

// Einstieg für die Makroleiste: gewählter Token, sonst der eigene Charakter.
export function attackFromMacro() {
  const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
  if (!actor) return ui.notifications.warn("Bitte wähle zuerst einen Token aus!");
  return executeAttack(actor);
}

const AREA_SHAPES = { cone: "Kegel", circle: "Kreis" };

/**
 * Flächenangriff: Vorlage platzieren, ein W100 für alle Ziele, Schaden einmal
 * würfeln. Der eine Wurf wird gegen den VW jedes getroffenen Tokens geprüft —
 * alle Ziele teilen sich also dasselbe Glück.
 */
export async function areaAttack(actor) {
  const entries = usableWeapons(actor);
  if (!entries.length) {
    return ui.notifications.warn("Dieser Charakter hat keine gültigen Waffen in seiner Liste!");
  }

  const remembered = Number(actor.getFlag("isekai-bogen", "lastWeaponIndex") || 0);
  const selectedIndex = entries.some(e => e.index === remembered) ? remembered : entries[0].index;

  const options = entries.map(({ weapon, index }) =>
    `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>` +
    `${weapon.name || `Waffe ${index + 1}`} (${weapon.rarity || "Common"})</option>`).join("");

  const setup = await new Promise(resolve => {
    new Dialog({
      title: `Flächenangriff von ${actor.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Waffe / Fähigkeit</label>
            <select name="weapon" style="width:100%;">${options}</select>
          </div>
          <div class="form-group">
            <label>Form</label>
            <select name="shape" style="width:100%;">
              <option value="cone">Kegel</option>
              <option value="circle">Kreis</option>
            </select>
          </div>
          <div class="form-group">
            <label>Reichweite / Radius (Felder)</label>
            <input type="number" name="distance" value="6" min="1"/>
          </div>
          <div class="form-group">
            <label>Öffnungswinkel des Kegels (Grad)</label>
            <input type="number" name="angle" value="53" min="5" max="360"/>
          </div>
          <p style="font-size:11px;">Ein W100 gilt für alle Ziele, der Schaden wird einmal gewürfelt.</p>
        </form>
      `,
      buttons: {
        place: {
          icon: '<i class="fas fa-bullseye"></i>',
          label: "Fläche platzieren",
          callback: (html) => resolve({
            index: Number(html.find('select[name="weapon"]').val()),
            shape: html.find('select[name="shape"]').val(),
            distance: Number(html.find('input[name="distance"]').val() || 6),
            angle: Number(html.find('input[name="angle"]').val() || 53)
          })
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Abbrechen", callback: () => resolve(null) }
      },
      default: "place",
      close: () => resolve(null)
    }).render(true);
  });
  if (!setup) return;

  const chosen = entries.find(e => e.index === setup.index);
  if (!chosen) return;
  await actor.setFlag("isekai-bogen", "lastWeaponIndex", setup.index);

  const placement = await placeTemplate({
    shape: setup.shape,
    distance: setup.distance,
    angle: setup.angle,
    actor
  });
  if (!placement) return ui.notifications.info("Flächenangriff abgebrochen.");

  const used = chosen.weapon;
  const targets = tokensInTemplate(placement)
    .filter(token => token?.actor && token.actor.id !== actor.id);

  const attack = await rollAttack("normal");
  const aw = attackValue(actor, used);

  const factor = machtfaktor(used.rarity);
  const flatBonus = damageBonus(actor, used);
  const diceType = used.dice || "1d6";
  const damageRoll = await new Roll(`(${diceType} * ${factor}) + ${flatBonus}`).evaluate({ async: true });

  let content =
    `💥 <strong>Flächenangriff mit ${used.name}</strong> ` +
    `<span style="font-size:11px;">(${AREA_SHAPES[setup.shape]}, ${setup.distance} Felder)</span><br>` +
    `${attack.label} — ein Wurf für alle Ziele<br>` +
    `<small>AW ${aw} = ${attackBreakdown(actor, used)}</small><hr>` +
    `💥 <strong>Schaden:</strong> ` +
    `<span style="font-size: 22px; font-weight: bold;">${damageRoll.total}</span> ` +
    `<small>(${damageRoll.result})</small>` +
    (typeLabels(used.damageTypes).length
      ? `<br><small>Schadensart: ${typeLabels(used.damageTypes).join(", ")}</small>` : "");

  if (!targets.length) {
    content += `<hr><span style="font-size:11px;">Kein Ziel in der Fläche.</span>`;
  }

  for (const token of targets) {
    const vw = defenceValue(token.actor);
    const chance = hitChanceFor(aw, vw);
    const isHit = attack.value <= chance;

    content += `<hr><strong>${token.name}</strong> — VW ${vw}, Chance ${chance}% → ` +
      (isHit ? `<strong>TREFFER</strong>` : `<strong>verfehlt</strong>`);

    if (!isHit) continue;

    const resolved = resolveDamage(token.actor, damageRoll.total, {
      types: used.damageTypes,
      rarity: used.rarity
    });
    content += describeDamage(token.name, resolved);
    await applyDamage(token.actor, resolved);
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [...attack.rolls, damageRoll]
  });
}

export function areaAttackFromMacro() {
  const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
  if (!actor) return ui.notifications.warn("Bitte wähle zuerst einen Token aus!");
  return areaAttack(actor);
}
