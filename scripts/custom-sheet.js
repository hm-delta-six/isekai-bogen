import { areaAttack, areaAttackFromMacro, attackFromMacro, attackValue, damageBonus, executeAttack } from "./attack.js";
import { rollSkillCheck } from "./skill-check.js";
import { ARMOR_WEAR_CHOICES, armorSummary, isIntact, registerDamageSocket } from "./damage.js";
import { registerTokenBars } from "./token-bars.js";
import { DAMAGE_TYPES, RARITY_CHOICES, machtfaktor, rarityRank, typeLabels, typeList } from "./rules.js";

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

    context.rarityChoices = RARITY_CHOICES;
    context.damageTypes = DAMAGE_TYPES;

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
    const listen = ['skills', 'equipment', 'weapons', 'titles', 'isekaiSkills', 'armors', 'resistances'];
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

    const raceRarityR = rarityRank(systemData.details?.race?.rarity);
    const raceLvl = Number(systemData.details?.race?.level || 1);
    const classRarityR = rarityRank(systemData.details?.class?.rarity);
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
      const skillRarityR = rarityRank(skill.rarity);
      skill.cap = (attrVal * 3) + (skillRarityR * 5);
    });

    // RÜSTUNG: DR-SUMME UND ZUSTAND JE TEIL
    systemData.armors.forEach(armor => {
      if (!armor) return;
      armor.intact = isIntact(armor);
      armor.typeLabel = typeLabels(armor.types).join(", ") || "alle Arten";
    });
    const drSummary = armorSummary(context.actor);

    // RESISTENZEN: Level kommt aus dem verknüpften Skill
    systemData.resistances.forEach(resistance => {
      if (!resistance) return;
      resistance.typeLabel = typeLabels(resistance.types).join(", ") || "keine Auswahl";
      const linked = systemData.isekaiSkills.find(skill =>
        String(skill?.name || "").trim().toLowerCase() ===
        String(resistance.skillName || "").trim().toLowerCase());
      resistance.level = Number(linked?.level || 0);
      resistance.rank = rarityRank(resistance.rarity);
      resistance.reduction = resistance.level * resistance.rank;
    });

    // AUSWAHLLISTE DER EIGENEN SKILLS FÜR DIE WAFFENTABELLE
    context.weaponSkillChoices = systemData.isekaiSkills.reduce((choices, skill) => {
      const name = String(skill?.name || "").trim();
      if (name) choices[name] = `${name} (${Number(skill.level || 0)})`;
      return choices;
    }, { "": "— kein Skill —" });

    // WAFFENSCHADEN BERECHNEN
    systemData.weapons.forEach(w => {
      if (!w) return;
      const m = machtfaktor(w.rarity);
      const diceLabel = context.diceChoices[w.dice] || "W6";
      const flatBonus = damageBonus(context.actor, w);
      const bonusStr = flatBonus >= 0 ? `+ ${flatBonus}` : `- ${Math.abs(flatBonus)}`;
      w.calculatedDamage = `${diceLabel} × ${m} ${bonusStr}`;
      w.typeLabel = typeLabels(w.damageTypes).join(", ") || "kein Typ";
      w.calculatedAW = attackValue(context.actor, w);
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

    context.derived = { hpMax, mpMax, apMax, initTotal, awTotal, vwTotal, dex, str, nextXpTarget, drSummary };
    return context;
  }

  // Offene Eingaben sichern, bevor ein Listeneintrag neu geschrieben wird.
  async _saveForm(html) {
    const form = html.closest('form')[0];
    await this.actor.update(this._getSubmitData(form));
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
      await this._saveForm(html);

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
    html.find('.add-weapon').click(ev => handleArrayAction(ev, 'weapons', 'add', { name: "", rarity: "Common", dice: "1d6", skillName: "", damageTypes: [], bonus: 0, description: "" }));
    html.find('.delete-weapon').click(ev => handleArrayAction(ev, 'weapons', 'delete'));

    // SCHADENSTYPEN WÄHLEN (Waffe, Rüstung, Resistenz)
    html.find('.typepick').click(async ev => {
      ev.preventDefault();
      const { field, index, key } = ev.currentTarget.dataset;
      await this._saveForm(html);
      await openTypePicker(this.actor, field, Number(index), key);
    });

    // FLÄCHENANGRIFF
    html.find('.area-attack').click(ev => {
      ev.preventDefault();
      areaAttack(this.actor);
    });

    // RESISTENZEN
    html.find('.add-resistance').click(ev => handleArrayAction(ev, 'resistances', 'add', { name: "", rarity: "Common", skillName: "", types: [], description: "" }));
    html.find('.delete-resistance').click(ev => handleArrayAction(ev, 'resistances', 'delete'));

    // RÜSTUNG
    html.find('.add-armor').click(ev => handleArrayAction(ev, 'armors', 'add', { name: "", rarity: "Common", dr: 0, durability: 10, types: [], description: "" }));
    html.find('.delete-armor').click(ev => handleArrayAction(ev, 'armors', 'delete'));

    // TITEL
    html.find('.add-title').click(ev => handleArrayAction(ev, 'titles', 'add', { name: "Neuer Titel", type: "STR", bonus: 0, comment: "" }));
    html.find('.delete-title').click(ev => handleArrayAction(ev, 'titles', 'delete'));
  }
}

/**
 * Kleines Auswahlfenster für die Schadenstypen. Die Typen sind ein Array im
 * Listeneintrag und lassen sich deshalb nicht über das normale Formular
 * speichern — der Eintrag wird hier direkt zurückgeschrieben.
 */
async function openTypePicker(actor, field, index, key) {
  let list = foundry.utils.duplicate(actor.system[field] || []);
  if (!Array.isArray(list)) list = Object.values(list);

  const entry = list[index];
  if (!entry) return;

  const selected = typeList(entry[key]);
  const boxes = Object.entries(DAMAGE_TYPES).map(([value, label]) =>
    `<label style="display:flex; align-items:center; gap:5px; font-size:12px;">
       <input type="checkbox" value="${value}" style="width:auto; margin:0;"
         ${selected.includes(value) ? "checked" : ""}/> ${label}
     </label>`).join("");

  const picked = await new Promise(resolve => {
    new Dialog({
      title: `Schadensarten: ${entry.name || "Ohne Namen"}`,
      content: `<form><div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px;">${boxes}</div></form>`,
      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: "Übernehmen",
          callback: (dialogHtml) => resolve(
            dialogHtml.find('input[type="checkbox"]:checked').map((_, el) => el.value).get()
          )
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Abbrechen", callback: () => resolve(null) }
      },
      default: "save",
      close: () => resolve(null)
    }).render(true);
  });

  if (!picked) return;
  entry[key] = picked;
  await actor.update({ [`system.${field}`]: list });
}

Hooks.once('init', () => {
  Actors.registerSheet("pf1", MeinHausregelSheet, {
    makeDefault: false,
    label: "ISEKAI Hausregel-Bogen"
  });
});

Hooks.once('setup', () => registerTokenBars());

Hooks.once('ready', () => {
  registerDamageSocket();

  // Einstiegspunkte für die Makroleiste
  game.isekaiBogen = {
    attack: attackFromMacro,
    attackWith: executeAttack,
    areaAttack: areaAttackFromMacro,
    rollSkillCheck
  };
});