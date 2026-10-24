import {
  ATTRIBUTES, LEVEL_FLOOR, LEVEL_REQ, MAX_LEVEL, TYPE_LABELS, ancestors, buildTree, descendants, effectLines,
  formatMilestones, makeCustomSkill, sheetEntry, unlockStatus, validateCustom
} from "./skill-graph.js";
import { toArray } from "./rules.js";

const MODULE_ID = "isekai-bogen";
const DATA_URL = `modules/${MODULE_ID}/data/skill-baum.json`;
const SETTING = "customSkills";

const DOMAIN_LABELS = {
  waffen: "Waffen", verteidigung: "Verteidigung", spezial: "Spezialangriffe", magie: "Magie",
  wissen: "Wissen", herstellung: "Herstellung", resistenz: "Resistenz", allgemein: "Allgemein",
  kombi: "Verschmelzungen"
};

const norm = (text) => String(text ?? "").trim().toLowerCase();

// Eigener Escape: Namen und Texte des Spielleiters landen in HTML-Strings.
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

let baseData = null;
async function loadBase() {
  if (baseData) return baseData;
  const response = await fetch(foundry.utils.getRoute(DATA_URL));
  if (!response.ok) throw new Error(`${DATA_URL}: HTTP ${response.status}`);
  baseData = await response.json();
  return baseData;
}

const customSkills = () => toArray(game.settings.get(MODULE_ID, SETTING)).filter(Boolean);

export function registerSkillTreeSettings() {
  // Eigene Skills gehören der Welt: der Spielleiter pflegt sie, alle sehen sie.
  game.settings.register(MODULE_ID, SETTING, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => SkillTreeApp.refresh()
  });
}

export class SkillTreeApp extends Application {

  static instance = null;
  static hooked = false;

  /** Öffnet das Fenster (oder holt es nach vorn) für den Charakter; ohne Charakter nur zum Ansehen. */
  static async open(actor = null) {
    let app = SkillTreeApp.instance;
    if (!app) {
      app = new SkillTreeApp();
      SkillTreeApp.instance = app;
    }
    app.actor = actor;

    if (!SkillTreeApp.hooked) {
      SkillTreeApp.hooked = true;
      // Ein Haken im Baum soll folgen, wenn der Bogen Skills ändert.
      Hooks.on("updateActor", (changed) => {
        const open = SkillTreeApp.instance;
        if (open?.rendered && open.actor?.id === changed.id) open.render();
      });
    }

    try {
      await app.reload();
    } catch (error) {
      console.error(`${MODULE_ID} | Skill-Baum konnte nicht geladen werden`, error);
      ui.notifications.error(`Skill-Baum konnte nicht geladen werden: ${error.message}`);
      return null;
    }
    app.bringToTop();
    return app;
  }

  static refresh() {
    const open = SkillTreeApp.instance;
    if (open?.rendered) open.reload().catch(error => console.error(error));
  }

  constructor(options = {}) {
    super(options);
    this.actor = null;
    this.tree = null;
    this.state = { domain: "waffen", selected: null, query: "" };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "isekai-skill-tree",
      title: "Skill-Baum",
      template: `modules/${MODULE_ID}/templates/skill-tree.html`,
      classes: ["isekai-skill-tree"],
      width: 1080,
      height: 700,
      resizable: true,
      scrollY: [".st-columns", ".st-detail"]
    });
  }

  get title() {
    return this.actor ? `Skill-Baum: ${this.actor.name}` : "Skill-Baum";
  }

  async reload() {
    this.tree = buildTree(await loadBase(), customSkills());
    if (this.state.selected && !this.tree.skills[this.state.selected]) this.state.selected = null;
    await this.render(true);
  }

  getData() {
    const tree = this.tree;
    const state = this.state;
    const ownedList = this.actor ? toArray(this.actor.system?.isekaiSkills).filter(Boolean) : [];
    const ownedNames = new Set(ownedList.map(skill => norm(skill.name)));
    const selected = state.selected ? tree.skills[state.selected] : null;
    const anc = selected ? ancestors(tree, selected.id) : new Set();
    const desc = selected ? descendants(tree, selected.id) : new Set();

    const domains = [{ key: "alle", label: "Alle" }, ...tree.doms.map(key => ({ key, label: DOMAIN_LABELS[key] || key }))]
      .map(entry => ({ ...entry, active: entry.key === state.domain }));

    const visible = tree.order
      .map(id => tree.skills[id])
      .filter(skill => state.domain === "alle" || skill.domain === state.domain);

    const columns = [];
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const skills = visible
        .filter(skill => skill.level === level)
        .sort((a, b) => a.name.localeCompare(b.name, "de"))
        .map(skill => ({
          id: skill.id,
          name: skill.name,
          lname: norm(skill.name),
          rarity: skill.floor,
          title: `${skill.name} (${skill.kind}${skill.custom ? ", eigener Skill" : ""})`,
          cls: [
            ownedNames.has(norm(skill.name)) ? "owned" : "",
            skill.custom ? "custom" : "",
            skill.id === state.selected ? "sel" : anc.has(skill.id) ? "anc" : desc.has(skill.id) ? "desc" : ""
          ].filter(Boolean).join(" ")
        }));
      if (!skills.length) continue;
      columns.push({ level, floor: tree.rn[LEVEL_FLOOR[level] - 1], req: LEVEL_REQ[level], skills });
    }

    return {
      domains,
      columns,
      query: state.query,
      isGM: game.user.isGM,
      actorName: this.actor?.name || "",
      detail: selected ? this._detail(selected, ownedList, anc) : null
    };
  }

  _detail(skill, ownedList, anc) {
    const tree = this.tree;
    const status = unlockStatus(tree, skill.id, ownedList);
    const hasActor = Boolean(this.actor);
    const link = (id) => ({ id, name: tree.skills[id].name, rarity: tree.skills[id].floor });

    return {
      id: skill.id,
      name: skill.name,
      level: skill.level,
      floor: skill.floor,
      kind: skill.kind,
      custom: skill.custom,
      domainLabel: DOMAIN_LABELS[skill.domain] || skill.domain,
      attr: skill.attr,
      typeLabel: TYPE_LABELS[skill.type],
      res: skill.res,
      kern: skill.kern,
      hasActor,
      actorName: this.actor?.name || "",
      owned: status.owned,
      ownedLevel: status.ownedLevel,
      needed: status.needed,
      canAdd: hasActor && this.actor.isOwner && !status.owned,
      parents: status.parents.map(parent => ({
        ...link(parent.id),
        level: parent.level,
        needed: parent.needed,
        ok: parent.ok,
        hint: parent.has ? `Level ${parent.level}, nötig ${parent.needed}` : "nicht im Bogen"
      })),
      ancestors: [...anc]
        .sort((a, b) => (tree.skills[a].level - tree.skills[b].level) || tree.skills[a].name.localeCompare(tree.skills[b].name, "de"))
        .map(link),
      children: skill.children.map(link),
      effects: effectLines(tree, skill.id)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const filter = () => {
      const query = norm(html.find(".st-search").val());
      this.state.query = query;
      html.find(".st-chip").each((_, el) => el.classList.toggle("hidden", Boolean(query) && !el.dataset.name.includes(query)));
    };
    html.find(".st-search").on("input", filter);
    if (this.state.query) filter();

    html.find(".st-tab").click(ev => {
      this.state.domain = ev.currentTarget.dataset.domain;
      this.render();
    });

    const select = (id) => {
      const skill = this.tree.skills[id];
      if (!skill) return;
      this.state.selected = id;
      // Ein Skill aus einem anderen Bereich bringt den Bereich mit
      if (this.state.domain !== "alle" && skill.domain !== this.state.domain) this.state.domain = skill.domain;
      this.render();
    };
    html.find(".st-chip, .st-link").click(ev => select(ev.currentTarget.dataset.id));

    html.find(".st-add").click(ev => this._addToSheet(ev.currentTarget.dataset.id));
    html.find(".st-new").click(() => this._openEditor());
    html.find(".st-edit").click(ev => this._openEditor(ev.currentTarget.dataset.id));
    html.find(".st-delete").click(ev => this._deleteCustom(ev.currentTarget.dataset.id));
  }

  async _addToSheet(id) {
    const skill = this.tree.skills[id];
    const actor = this.actor;
    if (!skill || !actor) return;
    if (!actor.isOwner) return ui.notifications.warn("Du darfst diesen Charakter nicht ändern.");

    const list = foundry.utils.duplicate(toArray(actor.system?.isekaiSkills)).filter(Boolean);
    const status = unlockStatus(this.tree, id, list);
    if (status.owned) return ui.notifications.info(`${skill.name} hat ${actor.name} schon.`);

    if (!status.ready) {
      const missing = status.parents.filter(parent => !parent.ok)
        .map(parent => `${parent.name} (${parent.has ? `Level ${parent.level}` : "fehlt"}, nötig ${parent.needed})`)
        .join(", ");

      if (!game.user.isGM) {
        return ui.notifications.warn(`${skill.name}: Voraussetzungen fehlen: ${missing}`);
      }
      const proceed = await Dialog.confirm({
        title: `${skill.name} trotzdem hinzufügen?`,
        content: `<p>Voraussetzungen nicht erfüllt: ${esc(missing)}.</p><p>Als Spielleiter darfst du den Skill trotzdem vergeben.</p>`
      });
      if (!proceed) return;
    }

    list.push(sheetEntry(skill));
    await actor.update({ "system.isekaiSkills": list });
    ui.notifications.info(`${skill.name} wurde zum Bogen von ${actor.name} hinzugefügt (${skill.floor}, Level 1).`);
  }

  // --- Eigene Skills (Spielleiter) ---

  async _openEditor(editId = null, prefill = null) {
    if (!game.user.isGM) return;

    const tree = this.tree;
    const existing = editId ? customSkills().find(entry => entry.id === editId) : null;
    if (editId && !existing) return ui.notifications.error("Der Skill existiert nicht mehr.");

    const value = prefill || (existing
      ? { ...existing, ms: formatMilestones(existing.ms, tree.rn) }
      : {
        name: "", level: 1, domain: this.state.domain in DOMAIN_LABELS ? this.state.domain : "allgemein",
        type: "F", attr: "STR", res: "", parents: [], kern: "", ms: ""
      });

    const options = (map, selected) => Object.entries(map)
      .map(([key, label]) => `<option value="${esc(key)}" ${String(key) === String(selected) ? "selected" : ""}>${esc(label)}</option>`).join("");

    const levels = Object.fromEntries(Array.from({ length: MAX_LEVEL }, (_, i) => [i + 1, `Ebene ${i + 1}`]));
    const attributes = Object.fromEntries(ATTRIBUTES.map(key => [key, key]));
    const costs = { "": "keine", AP: "AP", MP: "MP" };

    // Selbst und eigene Nachfolger scheiden als Eltern aus.
    const blocked = editId ? new Set([editId, ...descendants(tree, editId)]) : new Set();
    const parentRows = tree.order
      .map(id => tree.skills[id])
      .filter(skill => !blocked.has(skill.id))
      .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name, "de"))
      .map(skill => `
        <label class="par" data-level="${skill.level}" data-name="${esc(norm(skill.name))}" style="display:flex; gap:6px; align-items:center; margin:0;">
          <input type="checkbox" name="parent" value="${esc(skill.id)}" style="width:auto; margin:0;"
            ${(value.parents || []).includes(skill.id) ? "checked" : ""}/>
          <span>${esc(skill.name)} <small style="color:#94a3b8;">· Ebene ${skill.level} · ${esc(DOMAIN_LABELS[skill.domain])}</small></span>
        </label>`).join("");

    const content = `
      <form style="display:grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size:12px;">
        <label style="grid-column:1 / 3;">Name<input type="text" name="name" value="${esc(value.name)}"/></label>
        <label>Ebene<select name="level">${options(levels, value.level)}</select></label>
        <label>Bereich<select name="domain">${options(DOMAIN_LABELS, value.domain)}</select></label>
        <label>Typ<select name="type">${options(TYPE_LABELS, value.type)}</select></label>
        <label>Attribut<select name="attr">${options(attributes, value.attr)}</select></label>
        <label>Kosten<select name="res">${options(costs, value.res)}</select></label>
        <div></div>
        <div style="grid-column:1 / 3;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <b>Elternskills</b>
            <input type="search" class="par-filter" placeholder="filtern …" style="width:160px;"/>
          </div>
          <div class="par-list" style="max-height:170px; overflow:auto; border:1px solid #334155; padding:4px 6px; margin-top:3px;">${parentRows}</div>
          <small class="par-hint" style="color:#94a3b8;">Nur Skills unterhalb der gewählten Ebene sind wählbar. Ebene 1 hat keine Eltern.</small>
        </div>
        <label style="grid-column:1 / 3;">Beschreibung (was der Skill bewirkt)
          <textarea name="kern" rows="4" style="width:100%;">${esc(value.kern)}</textarea></label>
        <label style="grid-column:1 / 3;">Neu pro Rarität (optional, eine Zeile je Rarität, z. B. „Rare: …“)
          <textarea name="ms" rows="3" style="width:100%;">${esc(value.ms)}</textarea></label>
      </form>`;

    const collect = (html) => ({
      name: html.find('[name="name"]').val(),
      level: Number(html.find('[name="level"]').val()),
      domain: html.find('[name="domain"]').val(),
      type: html.find('[name="type"]').val(),
      attr: html.find('[name="attr"]').val(),
      res: html.find('[name="res"]').val(),
      parents: html.find('input[name="parent"]:checked').map((_, el) => el.value).get(),
      kern: html.find('[name="kern"]').val(),
      ms: html.find('[name="ms"]').val()
    });

    new Dialog({
      title: editId ? `Eigenen Skill bearbeiten: ${existing.name}` : "Eigenen Skill anlegen",
      content,
      render: (html) => {
        const applyLevel = () => {
          const level = Number(html.find('[name="level"]').val());
          html.find(".par").each((_, row) => {
            const allowed = Number(row.dataset.level) < level;
            const box = row.querySelector("input");
            if (!allowed) box.checked = false;
            box.disabled = !allowed;
            row.style.opacity = allowed ? "1" : "0.35";
          });
        };
        html.find('[name="level"]').on("change", applyLevel);
        html.find(".par-filter").on("input", ev => {
          const query = norm(ev.currentTarget.value);
          html.find(".par").each((_, row) => { row.style.display = !query || row.dataset.name.includes(query) ? "flex" : "none"; });
        });
        applyLevel();
      },
      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: "Speichern",
          callback: (html) => this._saveCustom(editId, collect(html))
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Abbrechen" }
      },
      default: "save"
    }, { width: 560 }).render(true);
  }

  async _saveCustom(editId, input) {
    const { errors, warnings } = validateCustom(this.tree, input, editId);
    if (errors.length) {
      ui.notifications.error(errors.join(" "));
      // Eingaben nicht verlieren: Editor mit denselben Werten wieder öffnen
      return this._openEditor(editId, input);
    }

    const list = customSkills();
    const id = editId || `x_${foundry.utils.randomID(10)}`;
    const entry = makeCustomSkill(input, id);
    const next = editId ? list.map(old => old.id === editId ? entry : old) : [...list, entry];

    this.state.selected = id;
    this.state.domain = entry.domain;
    await game.settings.set(MODULE_ID, SETTING, next);

    if (warnings.length) ui.notifications.warn(warnings.join(" "));
    ui.notifications.info(`Skill „${entry.name}“ gespeichert (Ebene ${entry.level}).`);
  }

  async _deleteCustom(id) {
    if (!game.user.isGM) return;
    const skill = this.tree.skills[id];
    if (!skill?.custom) return;

    if (skill.children.length) {
      const names = skill.children.map(child => this.tree.skills[child].name).join(", ");
      return ui.notifications.warn(`„${skill.name}“ ist Voraussetzung für ${names}. Erst diese ändern oder löschen.`);
    }

    const confirmed = await Dialog.confirm({
      title: "Eigenen Skill löschen?",
      content: `<p>„${esc(skill.name)}“ wird aus dem Baum entfernt. Bögen, die den Skill schon haben, behalten ihn.</p>`
    });
    if (!confirmed) return;

    this.state.selected = null;
    await game.settings.set(MODULE_ID, SETTING, customSkills().filter(entry => entry.id !== id));
  }
}
