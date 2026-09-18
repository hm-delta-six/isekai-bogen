import { rollSkillCheck } from "./skill-check.js";
import {
  ARMOR_WEAR_CHOICES, applyDamage, armorState, describeDamage,
  isIntact, registerDamageSocket, resolveDamage
} from "./damage.js";

const RARITY_MAP = {
  "Common": 1, "Uncommon": 2, "Rare": 3, "Epic": 4, "Legendary": 5, "Transzendiert": 6
};

const MACHTFAKTOR_MAP = {
  "Common": 1, "Uncommon": 2, "Rare": 4, "Epic": 8, "Legendary": 16, "Transzendiert": 32
};

class MeinHausregelSheet extends ActorSheet {

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["sheet", "actor", "isekai-sheet"],
      template: "modules/isekai-bogen/templates/sheet.html",
      width: 820,
      height: 900,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat" }]
    });
  }

  getData() {
    const context = super.getData();
    const systemData = context.actor.system;

    context.rarityChoices = {
      "Common": "Common", "Uncommon": "Uncommon", "Rare": "Rare",
      "Epic": "Epic", "Legendary": "Legendary", "Transzendiert": "Transzendiert"
    };

    context.attributeChoices = {
      "STR": "STR", "DEX": "DEX", "CON": "CON",
      "INT": "INT", "WIS": "WIS", "CHA": "CHA"
    };

    context.titleTypeChoices = {
      "STR": "STR", "DEX": "DEX", "CON": "CON",
      "WIS": "WIS", "INT": "INT", "CHA": "CHA",
      "HP": "HP", "MP": "MP", "AP": "AP"
    };

    context.armorWearChoices = ARMOR_WEAR_CHOICES;

    context.diceChoices = {
      "1d4": "W4", "1d6": "W6", "1d8": "W8", "1d10": "W10", "1d12": "W12"
    };

    const getAttr = (key) => Number(systemData.abilities?.[key]?.value || 0);
    const str = getAttr("STR"), dex = getAttr("DEX"), con = getAttr("CON");
    const int = getAttr("INT"), wis = getAttr("WIS"), cha = getAttr("CHA");

    // SICHERSTELLEN, DASS ALLE LISTEN (inkl. Titel) EXISTIEREN UND RICHTIG UMGESETZT WERDEN
    const listen = ['skills', 'equipment', 'weapons', 'titles', 'isekaiSkills', 'armors'];
    listen.forEach(key => {
      if (!systemData[key]) {
        systemData[key] = [];
      } else if (!Array.isArray(systemData[key])) {
        systemData[key] = Object.values(systemData[key]);
      }
    });

    // TITEL-BONI BERECHNEN
    const getTitleBonus = (type) => systemData.titles.reduce((acc, t) => t?.type === type ? acc + Number(t.bonus || 0) : acc, 0);

    context.effectiveAbilities = {
      STR: str + getTitleBonus("STR"),
      DEX: dex + getTitleBonus("DEX"),
      CON: con + getTitleBonus("CON"),
      INT: int + getTitleBonus("INT"),
      WIS: wis + getTitleBonus("WIS"),
      CHA: cha + getTitleBonus("CHA")
    };

    const raceRarityR = RARITY_MAP[systemData.details?.race?.rarity] || 1;
    const raceLvl = Number(systemData.details?.race?.level || 1);
    const classRarityR = RARITY_MAP[systemData.details?.class?.rarity] || 1;
    const classLvl = Number(systemData.details?.class?.level || 0);

    const raceBonus = raceLvl * (5 * raceRarityR);
    const classBonus = classLvl * (5 * classRarityR);
    const boni = systemData.boni || {};

    // FORMELN FÜR MAXIMALWERTE (inkl. Titel-Boni)
    const hpMax = (con * 5) + raceBonus + classBonus + Number(boni.hp || 0) + getTitleBonus("HP");
    const mpMax = (int * 5) + classBonus + Number(boni.mp || 0) + getTitleBonus("MP");
    const apMax = (con * 5) + raceBonus + classBonus + Number(boni.ap || 0) + getTitleBonus("AP");

    // KAMPFWERTE
    const awSkillLvl = Number(boni.awSkill || 0);
    const vwSkillLvl = Number(boni.vwSkill || 0);

    const initTotal = dex + Number(boni.init || 0);
    const awTotal = 10 + awSkillLvl + str + Number(boni.aw || 0);
    const vwTotal = 10 + vwSkillLvl + dex + Number(boni.vw || 0) - Number(boni.armormalus || 0);

    // PATHFINDER 1 EP TABELLE (Normal Progression)
    const pf1XpTable = [0, 1000, 3000, 7500, 14000, 23000, 35000, 53000, 77000, 115000, 160000, 235000, 330000, 475000, 665000, 955000, 1350000, 1900000, 2700000, 3850000, 5350000];
    
    // Gesamtstufe = Rassenstufe + Klassenstufe (Minimum 1)
    const totalCharLevel = Math.max(raceLvl + classLvl, 1);
    const nextXpTarget = pf1XpTable[totalCharLevel] || pf1XpTable[pf1XpTable.length - 1];

    // SKILL CAPS BERECHNEN
    systemData.isekaiSkills.forEach(skill => {
      if (!skill) return;
      const attrVal = getAttr(skill.attribute || "STR");
      const skillRarityR = RARITY_MAP[skill.rarity] || 1;
      skill.cap = (attrVal * 3) + (skillRarityR * 5);
    });

    // RÜSTUNG: DR-SUMME UND ZUSTAND JE TEIL
    systemData.armors.forEach(armor => {
      if (!armor) return;
      armor.intact = isIntact(armor);
    });
    const totalDR = armorState(context.actor).totalDR;

    // WAFFENSCHADEN BERECHNEN
    const halfAwSkillCeil = Math.ceil(awSkillLvl / 2);
    systemData.weapons.forEach(w => {
      if (!w) return;
      const m = MACHTFAKTOR_MAP[w.rarity] || 1;
      const diceLabel = context.diceChoices[w.dice] || "W6";
      const bonusVal = Number(w.bonus || 0);
      const flatBonus = str + halfAwSkillCeil + bonusVal;
      const bonusStr = flatBonus >= 0 ? `+ ${flatBonus}` : `- ${Math.abs(flatBonus)}`;
      w.calculatedDamage = `${diceLabel} × ${m} ${bonusStr}`;
    });

    // AKTEUR-MAX-WERTE DIREKT IN DIE DATENBANK SCHREIBEN (Falls abweichend)
    // Ohne gesetzten value-Wert bleiben die Token-Balken leer, deshalb wird er
    // beim ersten Mal auf max gesetzt und danach nur noch nach unten geklemmt.
    const syncPool = (current, max) => {
      const value = current === undefined || current === null ? max : Number(current);
      return Math.max(0, Math.min(value, max));
    };

    const hpValue = syncPool(systemData.attributes?.hp?.value, hpMax);
    const mpValue = syncPool(systemData.resources?.mp?.value, mpMax);
    const apValue = syncPool(systemData.resources?.ap?.value, apMax);

    if (systemData.attributes?.hp?.max !== hpMax ||
        systemData.resources?.mp?.max !== mpMax ||
        systemData.resources?.ap?.max !== apMax ||
        systemData.attributes?.hp?.value !== hpValue ||
        systemData.resources?.mp?.value !== mpValue ||
        systemData.resources?.ap?.value !== apValue) {
      this.actor.update({
        "system.attributes.hp.max": hpMax,
        "system.attributes.hp.value": hpValue,
        "system.resources.mp.max": mpMax,
        "system.resources.mp.value": mpValue,
        "system.resources.ap.max": apMax,
        "system.resources.ap.value": apValue
      }, { render: false });
    }

    if (systemData.attributes?.aw?.value !== awTotal || 
        systemData.attributes?.vw?.value !== vwTotal) {
      this.actor.update({
        "system.attributes.aw.value": awTotal,
        "system.attributes.vw.value": vwTotal
      }, { render: false });
    }         

    context.derived = { hpMax, mpMax, apMax, initTotal, awTotal, vwTotal, dex, str, nextXpTarget, totalDR };
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // EINGABEN BEIM VERLASSEN/ÄNDERN SPEICHERN
    html.find('input, select').on('change', async (ev) => {
      ev.preventDefault();
      const form = html.closest('form')[0];
      const formData = this._getSubmitData(form);
      await this.actor.update(formData);
    });

    // ANGREIFEN / WÜRFELN
    html.find('.roll-weapon').click(ev => {
      const index = ev.currentTarget.dataset.index;
      const weapon = this.actor.system.weapons[index];
      if (weapon) {
        executeAttack(this.actor, weapon);
      }
    });

    // SKILL-PROBE WÜRFELN (offen oder vergleichend, je nach markierten Tokens)
    html.find('.roll-skill').click(ev => {
      ev.preventDefault();
      rollSkillCheck(this.actor, ev.currentTarget.dataset.index);
    });

    // BILD-AUSWAHL (FilePicker) FÜR DEN TOKEN
    html.find('.profile-img').click(ev => {
      new FilePicker({
        type: "image",
        current: this.actor.img,
        callback: path => {
          this.actor.update({ img: path });
        }
      }).render(true);
    });

    // DYNAMISCHE ARRAYS (Skills, Ausrüstung, Waffen, Titel)
    const handleArrayAction = async (ev, fieldKey, action, defaultObj = {}) => {
      ev.preventDefault();
      
      const form = html.closest('form')[0];
      const formData = this._getSubmitData(form);
      await this.actor.update(formData);

      let list = foundry.utils.duplicate(this.actor.system[fieldKey] || []);
      if (!Array.isArray(list)) list = Object.values(list);

      if (action === 'add') {
        list.push(defaultObj);
      } else if (action === 'delete') {
        const idx = Number($(ev.currentTarget).data('index'));
        list.splice(idx, 1);
      }

      await this.actor.update({ [`system.${fieldKey}`]: list });
    };

    // SKILLS
    html.find('.add-skill').click(ev => handleArrayAction(ev, 'isekaiSkills', 'add', { name: "", rarity: "Common", level: 0, attribute: "STR", effect: "" }));
    html.find('.delete-skill').click(ev => handleArrayAction(ev, 'isekaiSkills', 'delete'));

    // AUSRÜSTUNG
    html.find('.add-equipment').click(ev => handleArrayAction(ev, 'equipment', 'add', { name: "", rarity: "Common", quantity: 1, effect: "" }));
    html.find('.delete-equipment').click(ev => handleArrayAction(ev, 'equipment', 'delete'));

    // WAFFEN
    html.find('.add-weapon').click(ev => handleArrayAction(ev, 'weapons', 'add', { name: "", rarity: "Common", dice: "1d6", bonus: 0, description: "" }));
    html.find('.delete-weapon').click(ev => handleArrayAction(ev, 'weapons', 'delete'));

    // RÜSTUNG
    html.find('.add-armor').click(ev => handleArrayAction(ev, 'armors', 'add', { name: "", rarity: "Common", dr: 0, durability: 10, description: "" }));
    html.find('.delete-armor').click(ev => handleArrayAction(ev, 'armors', 'delete'));

    // TITEL
    html.find('.add-title').click(ev => handleArrayAction(ev, 'titles', 'add', { name: "Neuer Titel", type: "STR", bonus: 0, comment: "" }));
    html.find('.delete-title').click(ev => handleArrayAction(ev, 'titles', 'delete'));
  }
}

// ANGRIFFSMAGIE & WÜRFEL-FUNKTION (Mit verbesserter Schadensanzeige & Lesbarkeit)
async function executeAttack(actor, weapon) {
  const targetedToken = game.user.targets.first();
  const targetActor = targetedToken?.actor;
  const targetName = targetedToken ? targetedToken.name : (actor.system.target?.name || "Ziel");
  
  let targetVW = 10;
  if (targetActor) {
    targetVW = Number(targetActor.system.attributes?.vw?.value || 10);
  } else {
    targetVW = Number(actor.system.target?.vw || 10);
  }

  const attackType = weapon.attribute || "STR"; 
  const governingAttrVal = Number(actor.system.abilities?.[attackType]?.value || 0);

  const awSkillLvl = Number(actor.system.boni?.awSkill || 0);
  const generalAwBonus = Number(actor.system.boni?.aw || 0);
  
  const weaponSkillLvl = Number(weapon.skill || 0);
  const weaponTempBonus = Number(weapon.bonus || 0);

  const actorAW = 10 + awSkillLvl + weaponSkillLvl + governingAttrVal + generalAwBonus + weaponTempBonus;

  let hitChance = 50 * (actorAW / targetVW);
  hitChance = Math.max(5, Math.min(95, Math.round(hitChance)));

  const str = Number(actor.system.abilities?.STR?.value || 0);
  const halfAwSkill = Math.ceil(awSkillLvl / 2);
  const m = MACHTFAKTOR_MAP[weapon.rarity] || 1;
  const wBonus = Number(weapon.bonus || 0);
  const diceType = weapon.dice || "1d6";
  const flatDamageBonus = str + halfAwSkill + wBonus;

  new Dialog({
    title: `Angriff mit ${weapon.name}`,
    content: `
      <form>
        <div style="font-size: 12px; margin-bottom: 8px;">
          <p>⚔️ <strong>Dein AW:</strong> ${actorAW} (${attackType}: ${governingAttrVal} + AW-Skill: ${awSkillLvl} + Waffen-Skill: ${weaponSkillLvl} + Temp: ${weaponTempBonus} + 10)</p>
          <p>🛡️ <strong>Ziel (${targetName}) VW:</strong> ${targetVW} ${targetedToken ? '(aus Ziel-Token)' : '(Standard)'}</p>
          <p style="margin-top: 4px;">🎯 <strong>Trefferchance:</strong> ${hitChance}% (Min 5% / Max 95%)</p>
          <hr>
          <p>💥 <strong>Schaden-Formel:</strong> (${diceType} × Machtfaktor ${m}) + ${flatDamageBonus}</p>
        </div>
        <p style="font-size: 11px;">Es wird ein W100 für den Treffer und ${diceType} für den Schaden gewürfelt.</p>
      </form>
    `,
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: "Angreifen",
        callback: async () => {
          const attackRoll = await new Roll("1d100").evaluate({async: true});
          const rollVal = attackRoll.total;
          const isHit = rollVal <= hitChance;

          const hitResultText = isHit 
            ? `<strong>TREFFER! (W100: ${rollVal} vs. Chance: ${hitChance}%)</strong>` 
            : `<strong>VERFEHLT! (W100: ${rollVal} vs. Chance: ${hitChance}%)</strong>`;

          const damageRoll = await new Roll(diceType).evaluate({async: true});
          const rawDiceValue = damageRoll.total;
          const multipliedDiceValue = rawDiceValue * m;
          const finalDamage = multipliedDiceValue + flatDamageBonus;

          let chatContent = `🎯 <strong>Angriff mit ${weapon.name} auf ${targetName}</strong><br>${hitResultText}<br><br>🎲 <strong>Angriffswurf:</strong> ${attackRoll.result} = <b>${rollVal}</b>`;

          if (!targetedToken || isHit) {
            chatContent += `<hr>` +
                           `<div>` +
                           `💥 <strong>Schaden (${weapon.name}):</strong> <span style="font-size: 20px; font-weight: bold; display: inline-block; margin-top: 2px;">${finalDamage}</span><br>` +
                           `<hr>` +
                           `<span style="font-size: 11px; line-height: 1.4; display: block;">` +
                           `🎲 <strong>Gewürfelt:</strong> ${damageRoll.result} (${diceType}) × Faktor ${m} = <b>${multipliedDiceValue}</b><br>` +
                           `➕ <strong>Bonus:</strong> +${flatDamageBonus} <span>[STR: ${str}, AW-Skill/2: ${halfAwSkill}, Bonus: ${wBonus}]</span>` +
                           `</span></div>`;
          } else {
            chatContent += `<br><span style="font-size: 11px;">(Kein Schaden, da verfehlt)</span>`;
          }

          // TREFFER AUF EIN MARKIERTES ZIEL: DR ABZIEHEN, REST VON DEN HP,
          // ÜBERSCHUSS VON DER HALTBARKEIT DER RÜSTUNG
          if (targetActor && isHit) {
            const resolved = resolveDamage(targetActor, finalDamage);
            chatContent += `<hr>` + describeDamage(targetName, resolved);
            await applyDamage(targetActor, resolved);
          }

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: chatContent,
            rolls: [attackRoll, damageRoll]
          });
        }
      }
    },
    default: "roll"
  }).render(true);
}

Hooks.once('init', () => {
  Actors.registerSheet("pf1", MeinHausregelSheet, {
    makeDefault: false,
    label: "ISEKAI Hausregel-Bogen"
  });
});

// MP und AP gehören nicht zum pf1-Datenmodell und tauchen deshalb weder in der
// Token-Konfiguration noch in Bar Brawl auf. Hier werden sie nachgetragen.
// setup statt init, damit die Liste des Systems bereits steht.
Hooks.once('setup', () => {
  const tracked = CONFIG.Actor?.trackableAttributes;
  if (!tracked) return;

  const bars = ["attributes.hp", "resources.mp", "resources.ap"];
  for (const config of Object.values(tracked)) {
    config.bar ??= [];
    for (const path of bars) {
      if (!config.bar.includes(path)) config.bar.push(path);
    }
  }
});

Hooks.once('ready', () => registerDamageSocket());