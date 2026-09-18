import { attackFromMacro, executeAttack } from "./attack.js";
import { rollSkillCheck } from "./skill-check.js";
import { ARMOR_WEAR_CHOICES, armorState, isIntact, registerDamageSocket } from "./damage.js";

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

    // AUSWAHLLISTE DER EIGENEN SKILLS FÜR DIE WAFFENTABELLE
    context.weaponSkillChoices = systemData.isekaiSkills.reduce((choices, skill) => {
      const name = String(skill?.name || "").trim();
      if (name) choices[name] = `${name} (${Number(skill.level || 0)})`;
      return choices;
    }, { "": "— kein Skill —" });

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

    // Massgeblich ist system.resources.hp — das Feld, in das der Bogen schreibt.
    // Nach system.attributes.hp wird bewusst NICHT gespiegelt: pf1 berechnet
    // dessen max bei jeder Datenvorbereitung aus Klassen-Trefferwuerfeln neu und
    // setzt es ohne pf1-Klassen auf 0. Ein Token-Balken darauf bleibt leer.
    const hpValue = syncPool(systemData.resources?.hp?.value, hpMax);
    const mpValue = syncPool(systemData.resources?.mp?.value, mpMax);
    const apValue = syncPool(systemData.resources?.ap?.value, apMax);

    const pools = {
      "system.resources.hp.max": hpMax,
      "system.resources.hp.value": hpValue,
      "system.resources.mp.max": mpMax,
      "system.resources.mp.value": mpValue,
      "system.resources.ap.max": apMax,
      "system.resources.ap.value": apValue
    };

    if (Object.entries(pools).some(([path, value]) =>
        foundry.utils.getProperty(context.actor, path) !== value)) {
      this.actor.update(pools, { render: false });
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
    html.find('.add-weapon').click(ev => handleArrayAction(ev, 'weapons', 'add', { name: "", rarity: "Common", dice: "1d6", skillName: "", bonus: 0, description: "" }));
    html.find('.delete-weapon').click(ev => handleArrayAction(ev, 'weapons', 'delete'));

    // RÜSTUNG
    html.find('.add-armor').click(ev => handleArrayAction(ev, 'armors', 'add', { name: "", rarity: "Common", dr: 0, durability: 10, description: "" }));
    html.find('.delete-armor').click(ev => handleArrayAction(ev, 'armors', 'delete'));

    // TITEL
    html.find('.add-title').click(ev => handleArrayAction(ev, 'titles', 'add', { name: "Neuer Titel", type: "STR", bonus: 0, comment: "" }));
    html.find('.delete-title').click(ev => handleArrayAction(ev, 'titles', 'delete'));
  }
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

  const bars = ["resources.hp", "resources.mp", "resources.ap"];
  for (const config of Object.values(tracked)) {
    config.bar ??= [];
    for (const path of bars) {
      if (!config.bar.includes(path)) config.bar.push(path);
    }
  }
});

Hooks.once('ready', () => {
  registerDamageSocket();

  // Einstiegspunkte für die Makroleiste
  game.isekaiBogen = {
    attack: attackFromMacro,
    attackWith: executeAttack,
    rollSkillCheck
  };
});