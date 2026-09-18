const MODULE_ID = "isekai-bogen";
const SETTING_PAIRS = "skillPairs";
const DEFAULT_PAIRS = "Heimlichkeit:DEX <-> Wahrnehmung:WIS";

const PAIR_SEPARATOR = /<->|<=>|↔|=>|->/;
const ENTRY_SEPARATOR = /[\n,;]+/;

const normalize = (value) => String(value ?? "").trim().toLowerCase();

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
};

// EINSTELLUNG: GEGENSÄTZLICHE SKILLS
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_PAIRS, {
    name: "Gegensätzliche Skills",
    hint: "Paare für vergleichende Würfe, eines pro Zeile. Format: Skill:ATTR <-> Skill:ATTR. " +
          "Das Attribut ist optional und wird nur benutzt, wenn das Ziel den Skill nicht auf dem Bogen hat.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_PAIRS
  });
});

// "Heimlichkeit:DEX <-> Wahrnehmung:WIS" -> [[{name, attribute}, {name, attribute}], ...]
function parseSkillPairs(raw) {
  const pairs = [];

  for (const entry of String(raw ?? "").split(ENTRY_SEPARATOR)) {
    const text = entry.trim();
    if (!text) continue;

    const sides = text.split(PAIR_SEPARATOR).map(s => s.trim()).filter(Boolean);
    if (sides.length !== 2) continue;

    const parsed = sides.map(side => {
      const [name, attribute] = side.split(":").map(part => part?.trim());
      return { name: name || "", attribute: (attribute || "").toUpperCase() };
    });

    if (!parsed[0].name || !parsed[1].name) continue;
    pairs.push(parsed);
  }

  return pairs;
}

// Bidirektionale Suche: ein Klick auf Wahrnehmung findet Heimlichkeit und umgekehrt.
function findCounterpart(skillName) {
  const needle = normalize(skillName);
  if (!needle) return null;

  const raw = game.settings.get(MODULE_ID, SETTING_PAIRS);
  for (const [left, right] of parseSkillPairs(raw)) {
    if (normalize(left.name) === needle) return right;
    if (normalize(right.name) === needle) return left;
  }

  return null;
}

function findSkillOnActor(actor, skillName) {
  const needle = normalize(skillName);
  if (!needle) return null;
  return toArray(actor?.system?.isekaiSkills).find(s => s && normalize(s.name) === needle) || null;
}

// Attribut inklusive Titel-Boni, genau wie der Bogen es oben anzeigt.
function effectiveAttribute(actor, attributeKey) {
  const key = String(attributeKey || "STR").toUpperCase();
  const base = Number(actor?.system?.abilities?.[key]?.value || 0);
  const titleBonus = toArray(actor?.system?.titles)
    .reduce((acc, t) => (t?.type === key ? acc + Number(t?.bonus || 0) : acc), 0);
  return base + titleBonus;
}

// 1d100 + Skill-Level + Attribut + Modifikator. Hoher Wurf ist gut.
async function rollAdditive({ actor, skillName, level, attribute, modifier = 0 }) {
  const attributeValue = effectiveAttribute(actor, attribute);
  const skillLevel = Number(level || 0);
  const mod = Number(modifier || 0);

  const roll = await new Roll("1d100").evaluate({ async: true });
  const die = roll.total;

  return {
    actor,
    skillName,
    attribute: String(attribute || "STR").toUpperCase(),
    attributeValue,
    skillLevel,
    modifier: mod,
    roll,
    die,
    total: die + skillLevel + attributeValue + mod,
    isCritical: die === 100,
    isFumble: die === 1
  };
}

function formatBreakdown(result) {
  const parts = [
    `W100: <b>${result.die}</b>`,
    `Skill: ${result.skillLevel}`,
    `${result.attribute}: ${result.attributeValue}`
  ];
  let text = parts.join(" + ");
  if (result.modifier) {
    text += result.modifier > 0 ? ` + Mod: ${result.modifier}` : ` - Mod: ${Math.abs(result.modifier)}`;
  }
  return text;
}

function critLabel(result) {
  if (result.isCritical) return ` <span style="color:#22c55e; font-weight:bold;">KRITISCHER ERFOLG</span>`;
  if (result.isFumble) return ` <span style="color:#ef4444; font-weight:bold;">KRITISCHER MISSERFOLG</span>`;
  return "";
}

// Modifikator immer, verdeckt würfeln nur für den SL.
function promptRollOptions({ skillName, counterpart, targetNames, isGM }) {
  const mode = targetNames.length
    ? `Vergleichender Wurf gegen ${targetNames.length} Ziel(e): <b>${targetNames.join(", ")}</b><br>` +
      `Gegen-Skill: <b>${counterpart.name}</b>`
    : `Offener Wurf (kein Token markiert)`;

  const hiddenField = isGM
    ? `<div style="margin-top:8px;">
         <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
           <input type="checkbox" name="hidden" style="width:auto; margin:0;"/>
           <span>Verdeckt würfeln (nur SL sieht das Ergebnis)</span>
         </label>
       </div>`
    : "";

  const content = `
    <form>
      <div style="background: rgba(15,23,42,0.6); padding: 8px; border-radius: 4px; font-size: 12px; margin-bottom: 8px;">
        <p style="margin:0;">🎲 <strong>${skillName}</strong></p>
        <p style="margin:4px 0 0 0; color:#94a3b8;">${mode}</p>
      </div>
      <div class="form-group">
        <label>Modifikator</label>
        <input type="number" name="modifier" value="0"/>
      </div>
      ${hiddenField}
    </form>
  `;

  return new Promise(resolve => {
    new Dialog({
      title: `Skill-Probe: ${skillName}`,
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Würfeln",
          callback: (html) => resolve({
            modifier: Number(html.find('input[name="modifier"]').val() || 0),
            hidden: isGM && html.find('input[name="hidden"]').is(":checked")
          })
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Abbrechen",
          callback: () => resolve(null)
        }
      },
      default: "roll",
      close: () => resolve(null),
      render: (html) => html.find('input[name="modifier"]').trigger("focus").trigger("select")
    }).render(true);
  });
}

function buildChatContent(own, comparisons) {
  let content =
    `<div style="background: rgba(15,23,42,0.7); padding: 8px; border-radius: 6px; border: 1px solid #334155;">` +
    `🎲 <strong>${own.skillName}</strong> <span style="color:#94a3b8;">(${own.attribute})</span><br>` +
    `<span style="color:#38bdf8; font-size: 22px; font-weight: bold; display:inline-block; margin-top:2px;">${own.total}</span>` +
    critLabel(own) +
    `<br><span style="color:#cbd5e1; font-size:11px;">${formatBreakdown(own)}</span>` +
    `</div>`;

  if (!comparisons.length) return content;

  content += `<hr style="border: 0; border-top: 1px solid #334155; margin: 8px 0;">`;

  let won = 0;
  for (const entry of comparisons) {
    const opposed = entry.result;
    const success = own.total > opposed.total;
    if (success) won += 1;

    const verdict = success
      ? `<span style="color:#22c55e; font-weight:bold;">gewonnen</span>`
      : `<span style="color:#ef4444; font-weight:bold;">verloren</span>`;

    content +=
      `<div style="margin-bottom:4px;">` +
      `🛡️ <strong>${entry.name}</strong> — ${opposed.skillName} ` +
      `<span style="color:#94a3b8;">(${opposed.attribute})</span>: ` +
      `<b style="color:#38bdf8;">${opposed.total}</b>${critLabel(opposed)} → ${verdict}<br>` +
      `<span style="color:#cbd5e1; font-size:11px;">${formatBreakdown(opposed)}` +
      (entry.hasSkill ? "" : ` <span style="color:#94a3b8;">[Skill nicht vorhanden, Level 0]</span>`) +
      `</span></div>`;
  }

  if (comparisons.length > 1) {
    content +=
      `<hr style="border: 0; border-top: 1px dashed #334155; margin: 6px 0;">` +
      `<span style="color:#cbd5e1; font-size:12px;">Gewonnen gegen <b>${won}</b> von <b>${comparisons.length}</b> Zielen ` +
      `<span style="color:#94a3b8;">(Gleichstand zählt für das Ziel)</span></span>`;
  }

  return content;
}

export async function rollSkillCheck(actor, skillIndex) {
  const skill = toArray(actor?.system?.isekaiSkills)[Number(skillIndex)];
  if (!skill) return ui.notifications.warn("Skill nicht gefunden.");

  const skillName = String(skill.name || "").trim() || "Unbenannter Skill";
  const counterpart = findCounterpart(skillName);

  const targets = Array.from(game.user.targets ?? [])
    .filter(token => token?.actor && token.actor.id !== actor.id);

  const isComparison = Boolean(counterpart) && targets.length > 0;
  const targetNames = isComparison ? targets.map(t => t.name) : [];

  const options = await promptRollOptions({
    skillName,
    counterpart,
    targetNames,
    isGM: game.user.isGM
  });
  if (!options) return;

  const own = await rollAdditive({
    actor,
    skillName,
    level: skill.level,
    attribute: skill.attribute,
    modifier: options.modifier
  });

  const comparisons = [];
  if (isComparison) {
    for (const token of targets) {
      const opposedSkill = findSkillOnActor(token.actor, counterpart.name);
      const result = await rollAdditive({
        actor: token.actor,
        skillName: counterpart.name,
        level: opposedSkill?.level || 0,
        attribute: opposedSkill?.attribute || counterpart.attribute || "WIS"
      });
      comparisons.push({ name: token.name, hasSkill: Boolean(opposedSkill), result });
    }
  }

  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: buildChatContent(own, comparisons),
    rolls: [own.roll, ...comparisons.map(c => c.result.roll)]
  };

  const rollMode = options.hidden
    ? CONST.DICE_ROLL_MODES.PRIVATE
    : CONST.DICE_ROLL_MODES.PUBLIC;

  await ChatMessage.create(ChatMessage.applyRollMode(messageData, rollMode));
}
