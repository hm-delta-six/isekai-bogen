import { applyDamage, describeDamage, resolveDamage } from "./damage.js";

const MACHTFAKTOR_MAP = {
  "Common": 1, "Uncommon": 2, "Rare": 4, "Epic": 8, "Legendary": 16, "Transzendiert": 32
};

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
};

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

function attackValue(actor, weapon) {
  return 10 +
    Number(actor.system?.boni?.awSkill || 0) +
    Number(weapon.skill || 0) +
    effectiveAttribute(actor, weapon.attribute) +
    Number(actor.system?.boni?.aw || 0) + bonusForType(actor, "AW") +
    Number(weapon.bonus || 0);
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
        <p>⚔️ <strong>Dein AW:</strong> <span class="display-aw">${aw}</span></p>
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

          const factor = MACHTFAKTOR_MAP[used.rarity] || 1;
          const strength = effectiveAttribute(actor, "STR");
          const halfAwSkill = Math.ceil(Number(actor.system?.boni?.awSkill || 0) / 2);
          const weaponBonus = Number(used.bonus || 0);
          const flatBonus = strength + halfAwSkill + weaponBonus;
          const diceType = used.dice || "1d6";

          const damageRoll = await new Roll(`(${diceType} * ${factor}) + ${flatBonus}`).evaluate({ async: true });

          let content =
            `🎯 <strong>Angriff mit ${used.name} auf ${targetName}</strong><br>` +
            (isHit
              ? `<strong>TREFFER! (W100: ${attack.value} vs. Chance: ${chance}%)</strong>`
              : `<strong>VERFEHLT! (W100: ${attack.value} vs. Chance: ${chance}%)</strong>`) +
            `<br><br>${attack.label}`;

          if (!targetedToken || isHit) {
            content += `<hr>` +
              `💥 <strong>Schaden (${used.name}):</strong><br>` +
              `<span style="font-size: 26px; font-weight: bold; line-height: 1.2;">${damageRoll.total}</span><br>` +
              `<small>Rechenweg: (${damageRoll.result}) [${diceType} × Machtfaktor ${factor}] ` +
              `+ STR (${strength}) + Halber AW-Skill (${halfAwSkill}) + Bonus (${weaponBonus})</small>`;
          } else {
            content += `<br><span style="font-size: 11px;">(Kein Schaden, da verfehlt)</span>`;
          }

          // DR abziehen, Rest von den HP, Überschuss von der Haltbarkeit
          if (targetActor && isHit) {
            const resolved = resolveDamage(targetActor, damageRoll.total);
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
