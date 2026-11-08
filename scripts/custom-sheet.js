import { areaDescription, attackFromMacro, attackValue, damageBonus, dieBonus, executeAttack, weaponArea } from "./attack.js";
import { SkillTreeApp, primeTreeLookup, registerSkillTreeSettings, treeLookup } from "./skill-tree.js";
import { rollSkillCheck } from "./skill-check.js";
import { ARMOR_WEAR_CHOICES, armorSummary, isIntact, registerDamageHooks, useSkillLookup } from "./damage.js";
import { registerTokenBars } from "./token-bars.js";
import {
  AREA_MODES, COST_TYPES, DAMAGE_TYPES, MOD_BONUS_TYPES, RARITY_CHOICES,
  DAMAGE_TYPES as DT, RESISTANCE_FORMULA, SKILL_BONUS_FORMULAS, SKILL_CATEGORIES,
  BOOST_FORMULAS, BOOST_TARGETS, SKILL_CATEGORY_HINTS, SKILL_USES_ATTRIBUTE, abilityValue,
  attackTotal, boostTotals, condLabel, damageReduction, defenceSkill, defenceTotal, enrichSkill,
  initiativeTotal, skillBoosts, typeBonus,
  machtfaktor, modBonus, rarityRank, resistanceDR, resistanceSources,
  skillBonus, skillCategory, toArray, typeLabels, typeList, typeValue
} from "./rules.js";

const MODULE_ID = "isekai-bogen";

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
    context.areaModes = AREA_MODES;
    context.skillCategories = SKILL_CATEGORIES;
    context.modBonusTypes = MOD_BONUS_TYPES;
    context.costTypes = COST_TYPES;

    context.attributeChoices = {
      "STR": "STR", "DEX": "DEX", "CON": "CON",
      "INT": "INT", "WIS": "WIS", "CHA": "CHA"
    };

    context.titleTypeChoices = {
      "STR": "STR", "DEX": "DEX", "CON": "CON",
      "WIS": "WIS", "INT": "INT", "CHA": "CHA",
      "HP": "HP", "MP": "MP", "AP": "AP",
      "AW": "AW", "VW": "VW", "INIT": "Initiative"
    };

    // Ausruestung kann wie ein Titel einen Wert heben. Die Felder dafuer
    // fehlten im Formular, der Angriffswurf las sie aber — ein eingetragener
    // Bonus verschwand damit beim naechsten Speichern.
    context.equipmentTypeChoices = { "": "—" , ...context.titleTypeChoices };

    context.armorWearChoices = ARMOR_WEAR_CHOICES;

    context.diceChoices = {
      "1d4": "W4", "1d6": "W6", "1d8": "W8", "1d10": "W10", "1d12": "W12"
    };

    const getAttr = (key) => Number(systemData.abilities?.[key]?.value || 0);
    const str = getAttr("STR"), dex = getAttr("DEX"), con = getAttr("CON");
    const int = getAttr("INT"), wis = getAttr("WIS"), cha = getAttr("CHA");

    // SICHERSTELLEN, DASS ALLE LISTEN (inkl. Titel) EXISTIEREN UND RICHTIG UMGESETZT WERDEN
    //
    // Nur eigene Listen! system.skills gehoert pf1 und ist dort ein Objekt mit
    // festen Schluesseln. Es stand hier mit in der Liste und wurde bei jedem
    // Zeichnen zu einem Array gemacht — danach findet pf1 in
    // _setSourceDetails seine Schluessel nicht mehr und die Datenaufbereitung
    // des ganzen Charakters bricht ab.
    const listen = ['equipment', 'weapons', 'titles', 'isekaiSkills', 'armors', 'resistances'];
    listen.forEach(key => {
      if (!systemData[key]) {
        systemData[key] = [];
      } else if (!Array.isArray(systemData[key])) {
        systemData[key] = Object.values(systemData[key]);
      }
    });

    // STEIGERUNGEN AUS DEN SKILLS
    // Welche Werte ein Skill hebt, steht im Skill-Baum. Der Bogen schlaegt es
    // beim Namen nach, damit niemand ein Skill-Level in ein Bonusfeld tippen
    // muss. Ohne eigene Angabe steigert ein Skill um Level x Raritaetsstufe.
    const enrichedSkills = systemData.isekaiSkills.map(skill => enrichSkill(skill, treeLookup()));
    const enrichedByName = new Map(enrichedSkills
      .filter(Boolean)
      .map(entry => [String(entry.name || "").trim().toLowerCase(), entry]));
    const boosts = boostTotals(enrichedSkills);

    // TITEL-BONI BERECHNEN
    // Dieselbe Summe wie im Angriffswurf: Titel und Ausruestung.
    const getTitleBonus = (type) => typeBonus(systemData, type);

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
    //
    // MP kennen bewusst keinen Rassenbonus: die Klasse ist die Quelle von MP,
    // HP und AP kommen aus Rasse und Klasse.
    const hpMax = (con * 5) + raceBonus + classBonus + Number(boni.hp || 0) + getTitleBonus("HP") + boosts.totals.hp;
    const mpMax = (int * 5) + classBonus + Number(boni.mp || 0) + getTitleBonus("MP") + boosts.totals.mp;
    const apMax = (con * 5) + raceBonus + classBonus + Number(boni.ap || 0) + getTitleBonus("AP") + boosts.totals.ap;

    // KAMPFWERTE
    const awSkillLvl = Number(boni.awSkill || 0);
    const vwSkillLvl = Number(boni.vwSkill || 0);

    // STR und DEX mit Titel-Boni: der Angriffswurf rechnet ebenso, sonst
    // stimmt der Wert im Bogen nicht mit dem Wurf ueberein.
    const strEff = context.effectiveAbilities.STR;
    const dexEff = context.effectiveAbilities.DEX;
    const strTitle = getTitleBonus("STR");
    const dexTitle = getTitleBonus("DEX");
    // Skills wie Ruestungstragen senken den Ruestungsmalus.
    const armorMalusRaw = Number(boni.armormalus || 0);
    const armorMalus = Math.max(0, armorMalusRaw - boosts.totals.armormalus);

    // Das Attribut des Verteidigungswerts kommt vom staerksten Abwehr-Skill:
    // Ausweichen traegt DEX, Parade STR. Nichts auszuwaehlen.
    const defence = defenceSkill(enrichedSkills);
    const defenceAttr = context.effectiveAbilities[defence.attribute] ?? dexEff;

    // Dieselben Funktionen, die der Angriffswurf benutzt.
    const initTotal = initiativeTotal(systemData, enrichedSkills);
    const awTotal = attackTotal(systemData, enrichedSkills);
    const vwTotal = defenceTotal(systemData, enrichedSkills);

    // Rechenweg fuer die Hilfe-Symbole, mit den Zahlen dieses Charakters.
    const titleNote = (value, base, bonus) =>
      bonus ? `${value} (${base} + ${bonus} aus Titeln)` : `${value}`;

    // Woher eine Steigerung kommt, gehoert in die Hilfe.
    const boostNote = (target) => {
      const quellen = boosts.sources[target];
      if (!quellen.length) return "";
      return `Aus Skills: ${quellen.map(e => `${e.name} ${e.amount}`).join(" + ")}` +
        ` = ${boosts.totals[target]}. `;
    };
    const situationNote = (target) => {
      const lagen = boosts.situational.filter(entry => entry.target === target);
      if (!lagen.length) return "";
      return `Nicht mitgerechnet, weil es von der Lage abhaengt: ` +
        `${lagen.map(e => `${e.name} (${e.situation})`).join(", ")}. `;
    };

    context.awHelp =
      `Grundwert 10 + AW-Skill ${awSkillLvl} + STR ${titleNote(strEff, str, strTitle)}` +
      ` + Boni ${Number(boni.aw || 0)}` +
      `${getTitleBonus("AW") ? ` + Titel/Ausrüstung ${getTitleBonus("AW")}` : ""}` +
      ` + Skills ${boosts.totals.aw} = ${awTotal}. ` +
      boostNote("aw") + situationNote("aw") +
      `Beim Angriff mit einer Waffe kommen dazu: Level und Machtfaktor des Waffenskills, ` +
      `der Waffenbonus und die Boni der gewaehlten Modifikationen. ` +
      `Ab gehen Flaechenmalus und Zielmalus. ` +
      `Steht ein anderes Attribut am Waffenskill, zaehlt dieses statt STR.`;

    const defenceNote = defence.name
      ? `Das Attribut kommt von ${defence.name}, dem stärksten Abwehr-Skill: ${defence.attribute}. `
      : `Ohne Abwehr-Skill trägt DEX den Verteidigungswert. `;

    const malusNote = boosts.totals.armormalus
      ? `Rüstungsmalus ${armorMalusRaw} − ${boosts.totals.armormalus} aus Skills = ${armorMalus}. `
      : "";

    context.vwHelp =
      `Grundwert 10 + Extra ${vwSkillLvl} + ${defence.attribute} ` +
      `${titleNote(defenceAttr, Number(systemData.abilities?.[defence.attribute]?.value || 0), getTitleBonus(defence.attribute))}` +
      ` + Boni ${Number(boni.vw || 0)}` +
      `${getTitleBonus("VW") ? ` + Titel/Ausrüstung ${getTitleBonus("VW")}` : ""}` +
      ` + Skills ${boosts.totals.vw}` +
      ` − Rüstungsmalus ${armorMalus} = ${vwTotal}. ` +
      boostNote("vw") + situationNote("vw") + malusNote + defenceNote +
      `Ein Angreifer vergleicht seinen AW mit diesem Wert; die Trefferchance ist ` +
      `50 × AW ÷ VW, begrenzt auf 5 bis 95 Prozent. ` +
      `Der Wert wird in den Charakterdaten mitgeführt, damit Angriffe ihn finden.`;

    context.defence = defence;

    context.initHelp =
      `DEX ${titleNote(dexEff, dex, dexTitle)} + Boni ${Number(boni.init || 0)}` +
      ` + Skills ${boosts.totals.init} = ${initTotal}. ` + boostNote("init") + situationNote("init");

    context.boostTargets = BOOST_TARGETS;
    context.boostSituational = boosts.situational;

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
      // Der Deckel wird angezeigt, aber nicht erzwungen: ein Level darueber
      // waere sonst stillschweigend wirksam.
      skill.overCap = Number(skill.level || 0) > skill.cap;
      // Die Tabelle kommt aus dem Baum, sonst bliebe eine Resistenz bei den
      // passiven Skills stehen, wo sie vor der eigenen Tabelle eingetragen war.
      skill.category = skillCategory(enrichedByName.get(String(skill.name || "").trim().toLowerCase()) || skill);
      // Bonus nach der Formel der Kategorie, mit dem Attribut inklusive Titel-Boni
      // Auch die Rechenregel kommt aus dem Baum, wenn der Skill eine eigene hat.
      const ausBaum = enrichedByName.get(String(skill.name || "").trim().toLowerCase());
      skill.bonusMode = ausBaum?.bonusMode || "";
      skill.bonus = skillBonus(skill, context.effectiveAbilities[skill.attribute || "STR"] || 0);
    });

    // VIER TABELLEN AUS EINER LISTE: der Index bleibt der der Datenliste,
    // damit die Formularfelder und alle Verknuepfungen weiter stimmen.
    const byName = (a, b) => String(a.skill.name || "").localeCompare(String(b.skill.name || ""), "de");
    context.skillGroups = Object.entries(SKILL_CATEGORIES).map(([key, label]) => ({
      key,
      label,
      hint: SKILL_CATEGORY_HINTS[key],
      formula: SKILL_BONUS_FORMULAS[key],
      usesAttribute: SKILL_USES_ATTRIBUTE[key],
      entries: systemData.isekaiSkills
        .map((skill, index) => ({ index, skill }))
        .filter(entry => entry.skill && skillCategory(entry.skill) === key)
        .sort(byName)
    }));

    // Nur Modifikations-Skills lassen sich an eine Waffe haengen.
    context.modSkillChoices = systemData.isekaiSkills
      .filter(skill => skill && skillCategory(skill) === "modifikation")
      .map(skill => String(skill.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "de"))
      .reduce((choices, name) => ({ ...choices, [name]: name }), { "": "\u2014 Skill waehlen \u2014" });

    // RÜSTUNG: DR-SUMME UND ZUSTAND JE TEIL
    systemData.armors.forEach(armor => {
      if (!armor) return;
      armor.intact = isIntact(armor);
      armor.typeLabel = typeLabels(armor.types).join(", ") || "alle Arten";
      armor.typeValue = typeValue(armor.types);
    });
    const drSummary = armorSummary(context.actor);

    // GESAMTE DR JE SCHADENSART: Ruestung plus Resistenz-Skills.
    // Resistenzen traegt der Spielleiter als passive Skills ein; Typen und
    // stillgelegte Eltern kommen aus dem Skill-Baum mit.
    const sources = resistanceSources({
      resistances: systemData.resistances,
      skills: enrichedSkills,
      lookup: treeLookup()
    });
    const reduction = damageReduction({ armors: systemData.armors, resistances: sources });

    context.resistanceFormula = RESISTANCE_FORMULA;
    context.drByType = Object.entries(DT).map(([key, label]) => ({
      label,
      flat: reduction.flat[key],
      cond: reduction.conditional[key]
    }));
    context.drSources = reduction.active.filter(entry => !entry.cond);
    context.drConditional = reduction.active
      .filter(entry => entry.cond)
      .map(entry => ({ ...entry, condLabel: condLabel(entry.cond) }));
    // Nur stillgelegte Skills nennen, die der Charakter wirklich hat.
    const ownedResistances = new Set(sources.map(entry => String(entry.name || "").trim().toLowerCase()));
    context.drRetiredNames = reduction.retiredLabels.filter(name => ownedResistances.has(name.toLowerCase()));
    // Was der Skill selbst zur DR beitraegt, am Skill zeigen; die Felder aus
    // dem Baum werden dabei in den Bogen uebernommen, damit sie nicht bei
    // jedem Oeffnen neu nachgeschlagen werden muessen.
    const retired = new Set(reduction.retired);
    const sourceByName = new Map(sources.map(entry => [String(entry.name || "").trim().toLowerCase(), entry]));
    systemData.isekaiSkills.forEach(skill => {
      if (!skill) return;
      const source = sourceByName.get(String(skill.name || "").trim().toLowerCase());
      skill.types = typeValue(source?.types ?? skill.types);
      skill.replaces = source?.replaces || skill.replaces || "";
      skill.cond = source?.cond || skill.cond || "";
      skill.retired = retired.has(String(skill.name || "").trim().toLowerCase());
      skill.resistTypes = typeLabels(skill.types).join(", ");
      skill.resistValue = skill.resistTypes ? resistanceDR(skill) : 0;
      skill.condLabel = condLabel(skill.cond);
      skill.bonusNote = BOOST_FORMULAS[enrichedByName.get(String(skill.name || "").trim().toLowerCase())?.bonusMode] || "";

      // Was der Skill steigert, am Skill selbst zeigen.
      const enriched = enrichedByName.get(String(skill.name || "").trim().toLowerCase());
      skill.boostText = skillBoosts(enriched || skill)
        .map(boost => `${boost.lowers ? "−" : "+"}${boost.amount} ${BOOST_TARGETS[boost.target]}` +
          (boost.situation ? ` (nur ${boost.situation})` : ""))
        .join(" · ");
    });

    // RESISTENZEN: Level kommt aus dem verknüpften Skill
    systemData.resistances.forEach(resistance => {
      if (!resistance) return;
      resistance.typeLabel = typeLabels(resistance.types).join(", ") || "keine Auswahl";
      resistance.typeValue = typeValue(resistance.types);
      const linked = systemData.isekaiSkills.find(skill =>
        String(skill?.name || "").trim().toLowerCase() ===
        String(resistance.skillName || "").trim().toLowerCase());
      resistance.level = Number(linked?.level || 0);
      resistance.factor = machtfaktor(resistance.rarity);
      resistance.reduction = resistanceDR(resistance);
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
      const perDie = dieBonus(w);
      const diceText = perDie
        ? `(${diceLabel} ${perDie > 0 ? "+" : "−"} ${Math.abs(perDie)})`
        : diceLabel;
      w.calculatedDamage = `${diceText} × ${m} ${bonusStr}`;
      w.typeLabel = typeLabels(w.damageTypes).join(", ") || "kein Typ";
      w.typeValue = typeValue(w.damageTypes);
      // Bereich: leeres Größenfeld heißt volle Größe, der Maximalwert steht als Platzhalter
      const area = weaponArea(context.actor, w);
      w.areaMode = area.mode;
      w.areaMax = area.max;
      w.areaSingle = area.mode === "single";
      w.areaMalus = area.malus;
      w.areaText = areaDescription(area);
      w.calculatedAW = attackValue(context.actor, w) - area.malus;

      // Modifikations-Skills: Bonushoehe kommt aus dem verknuepften Skill
      w.mods = toArray(w.mods);
      w.mods.forEach(mod => {
        if (!mod) return;
        const linked = systemData.isekaiSkills.find(skill =>
          String(skill?.name || "").trim().toLowerCase() ===
          String(mod.skillName || "").trim().toLowerCase());
        mod.bonus = linked ? modBonus(linked) : 0;
        mod.missing = Boolean(mod.skillName) && !linked;
      });
    });

    // EIGENE WERTE IN DIE DATENBANK SCHREIBEN
    //
    // Sie liegen unter system.isekai und NICHT unter system.resources oder
    // system.attributes: beides gehoert pf1. system.resources haelt dort die
    // Klassen-Ressourcen, und pf1 laeuft bei jeder Datenvorbereitung ueber
    // alle Schluessel. Eigene Eintraege lassen _setSourceDetails ins Leere
    // greifen — "Cannot read properties of undefined (reading 'push')" —, und
    // das bei jedem actor.update, also auch beim Schadensabzug.
    const pool = systemData.isekai || {};
    const legacy = systemData.resources || {};

    // Ohne gesetzten value-Wert bleiben die Token-Balken leer, deshalb wird er
    // beim ersten Mal auf max gesetzt und danach nur noch nach unten geklemmt.
    const syncPool = (current, fallback, max) => {
      const raw = current ?? fallback;
      const value = raw === undefined || raw === null ? max : Number(raw);
      return Math.max(0, Math.min(value, max));
    };

    const hpValue = syncPool(pool.hp?.value, legacy.hp?.value, hpMax);
    const mpValue = syncPool(pool.mp?.value, legacy.mp?.value, mpMax);
    const apValue = syncPool(pool.ap?.value, legacy.ap?.value, apMax);

    const owned = {
      "system.isekai.hp.max": hpMax,
      "system.isekai.hp.value": hpValue,
      "system.isekai.mp.max": mpMax,
      "system.isekai.mp.value": mpValue,
      "system.isekai.ap.max": apMax,
      "system.isekai.ap.value": apValue,
      "system.isekai.aw.value": awTotal,
      "system.isekai.vw.value": vwTotal
    };

    const changed = Object.entries(owned)
      .some(([path, value]) => foundry.utils.getProperty(context.actor, path) !== value);

    // Altlasten aus system.resources entfernen, sonst wirft pf1 weiter.
    const cleanup = {};
    for (const key of ["hp", "mp", "ap"]) {
      if (legacy[key] !== undefined) cleanup[`system.resources.-=${key}`] = null;
    }
    for (const key of ["aw", "vw"]) {
      if (systemData.attributes?.[key] !== undefined) cleanup[`system.attributes.-=${key}`] = null;
    }

    if (changed || Object.keys(cleanup).length) {
      this.actor.update({ ...owned, ...cleanup }, { render: false });
    }

    context.pool = { hp: hpValue, mp: mpValue, ap: apValue };

    context.derived = {
      hpMax, mpMax, apMax, initTotal, awTotal, vwTotal, dex, str, nextXpTarget, drSummary,
      defenceAttr
    };
    return context;
  }

  /**
   * Nach dem Speichern neu zeichnen: Angriffswert, Schaden, Schadens-
   * reduktion und die Hilfetexte entstehen erst in getData. Haelt Foundry
   * eine Aenderung fuer unerheblich und zeichnet nicht neu, blieben sie auf
   * dem alten Stand stehen.
   */
  async _updateObject(event, formData) {
    await super._updateObject(event, formData);
    this.render(false);
  }

  /**
   * Offene Eingaben sichern, bevor ein Listeneintrag neu geschrieben wird.
   *
   * _getSubmitData nimmt kein Formular, sondern zusaetzliche Daten und liest
   * das Formular selbst aus this.form. Ein Formular-Element als Argument
   * mischt dessen eigene Eigenschaften in die Daten: ein HTMLFormElement
   * fuehrt seine Felder unter den Indizes 0, 1, 2 ..., die damit als
   * Aktualisierung an den Charakter gehen.
   */
  async _saveForm() {
    await this.actor.update(this._getSubmitData());
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Das Speichern bei Aenderungen macht Foundry selbst: ActorSheet laeuft
    // mit submitOnChange. Ein eigener change-Hoerer hat jede Aenderung ein
    // zweites Mal geschrieben.

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
      await this._saveForm();

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

    // Modifikationen liegen in der Waffe, brauchen also einen eigenen Griff.
    const handleModAction = async (ev, action) => {
      ev.preventDefault();
      await this._saveForm();

      let weapons = foundry.utils.duplicate(this.actor.system.weapons || []);
      if (!Array.isArray(weapons)) weapons = Object.values(weapons);

      const weaponIndex = Number(ev.currentTarget.dataset.index);
      const weapon = weapons[weaponIndex];
      if (!weapon) return;

      let mods = weapon.mods || [];
      if (!Array.isArray(mods)) mods = Object.values(mods);

      if (action === 'add') {
        mods.push({ skillName: "", bonusType: "aw", costType: "mp", costValue: 0 });
      } else {
        mods.splice(Number(ev.currentTarget.dataset.mod), 1);
      }

      weapon.mods = mods;
      await this.actor.update({ "system.weapons": weapons });
    };

    // SKILL-BAUM ÖFFNEN
    html.find('.open-skill-tree').click(ev => {
      ev.preventDefault();
      SkillTreeApp.open(this.actor);
    });

    // SKILLS
    // Skills kommen ausschliesslich aus dem Baum: nur dort sind Ebene,
    // Voraussetzungen, Schadensarten und Ersetzungen hinterlegt. Ein frei
    // angelegter Eintrag haette davon nichts und wuerde bei der DR fehlen.
    html.find('.delete-skill').click(ev => handleArrayAction(ev, 'isekaiSkills', 'delete'));

    // AUSRÜSTUNG
    html.find('.add-equipment').click(ev => handleArrayAction(ev, 'equipment', 'add', { name: "", rarity: "Common", quantity: 1, type: "", bonus: 0, effect: "" }));
    html.find('.delete-equipment').click(ev => handleArrayAction(ev, 'equipment', 'delete'));

    // WAFFEN
    html.find('.add-weapon').click(ev => handleArrayAction(ev, 'weapons', 'add', { name: "", rarity: "Common", dice: "1d6", dieBonus: 0, skillName: "", damageTypes: "", areaMode: "single", areaSize: "", bonus: 0, description: "" }));
    html.find('.delete-weapon').click(ev => handleArrayAction(ev, 'weapons', 'delete'));

    // SCHADENSTYPEN WÄHLEN (Waffe, Rüstung, Resistenz)
    html.find('.typepick').click(async ev => {
      ev.preventDefault();
      const { field, index, key } = ev.currentTarget.dataset;
      await this._saveForm();
      await openTypePicker(this.actor, field, Number(index), key);
    });

    // RESISTENZEN
    html.find('.add-resistance').click(ev => handleArrayAction(ev, 'resistances', 'add', { name: "", rarity: "Common", skillName: "", types: "", description: "" }));
    html.find('.delete-resistance').click(ev => handleArrayAction(ev, 'resistances', 'delete'));

    // MODIFIKATIONS-SKILLS AN EINER WAFFE
    html.find('.add-weapon-mod').click(ev => handleModAction(ev, 'add'));
    html.find('.delete-weapon-mod').click(ev => handleModAction(ev, 'delete'));

    // RÜSTUNG
    html.find('.add-armor').click(ev => handleArrayAction(ev, 'armors', 'add', { name: "", rarity: "Common", dr: 0, durability: 10, types: "", description: "" }));
    html.find('.delete-armor').click(ev => handleArrayAction(ev, 'armors', 'delete'));

    // TITEL
    html.find('.add-title').click(ev => handleArrayAction(ev, 'titles', 'add', { name: "Neuer Titel", type: "STR", bonus: 0, comment: "" }));
    html.find('.delete-title').click(ev => handleArrayAction(ev, 'titles', 'delete'));
  }
}

/**
 * Repariert Charaktere, bei denen eine fruehere Fassung dieses Bogens pf1s
 * system.skills von einem Objekt in ein Array verwandelt hat.
 *
 * Solange es ein Array ist, bricht pf1 in _setSourceDetails ab
 * ("Cannot read properties of undefined (reading 'push')") und bereitet die
 * Daten des Charakters gar nicht mehr auf — abgeleitete Werte bleiben dann
 * stehen, egal was man im Bogen aendert.
 *
 * Die Reihenfolge von Object.values entspricht der Schluesselreihenfolge, die
 * Schluessel lassen sich also zurueckstecken. Passt die Anzahl nicht, wird
 * das Feld entfernt; pf1 legt es aus seiner eigenen Vorlage neu an.
 */
export async function repairPf1Skills(actor) {
  const skills = actor?.system?.skills;
  if (!Array.isArray(skills)) return false;

  const keys = Object.keys(CONFIG.PF1?.skills || {});
  const update = keys.length === skills.length
    ? { "system.skills": Object.fromEntries(keys.map((key, index) => [key, skills[index]])) }
    : { "system.-=skills": null };

  console.warn(`${MODULE_ID} | ${actor.name}: pf1s system.skills lag als Liste vor und wird ` +
    (keys.length === skills.length ? "wieder zu einem Objekt gemacht." : "entfernt, damit pf1 es neu anlegt."));

  await actor.update(update, { render: false });
  return true;
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
  entry[key] = picked.join(",");
  await actor.update({ [`system.${field}`]: list });
}

Hooks.once('init', () => {
  Actors.registerSheet("pf1", MeinHausregelSheet, {
    makeDefault: false,
    label: "ISEKAI Hausregel-Bogen"
  });
});

Hooks.once('setup', () => registerTokenBars());

Hooks.once('init', () => registerSkillTreeSettings());

Hooks.once('ready', async () => {
  registerDamageHooks();

  // Charaktere einsammeln, die noch die zerstoerte Skill-Struktur tragen.
  if (game.user.isGM) {
    let repariert = 0;
    for (const actor of game.actors) {
      try {
        if (await repairPf1Skills(actor)) repariert += 1;
      } catch (error) {
        console.error(`${MODULE_ID} | ${actor?.name}: Reparatur von system.skills fehlgeschlagen`, error);
      }
    }
    if (repariert) {
      ui.notifications.info(`ISEKAI-Bogen: pf1-Skills von ${repariert} Charakter(en) wiederhergestellt.`);
    }
  }

  // Schadensarten und Ersetzungen stehen im Skill-Baum; von Hand eingetragene
  // Skills im Bogen bringen sie nicht mit und werden daraus nachgefuellt.
  useSkillLookup(treeLookup);
  primeTreeLookup().then(() => {
    for (const app of Object.values(ui.windows)) {
      if (app instanceof ActorSheet) app.render(false);
    }
  });

  // Einstiegspunkte für die Makroleiste
  game.isekaiBogen = {
    attack: attackFromMacro,
    attackWith: executeAttack,
    rollSkillCheck,
    // Skill-Baum: ohne Argument für den gewählten Token bzw. den eigenen Charakter
    openSkillTree: (actor = null) =>
      SkillTreeApp.open(actor || canvas.tokens?.controlled?.[0]?.actor || game.user.character || null)
  };
});
