import {
  ATTRIBUTES, LEVEL_FLOOR, MAX_LEVEL, TYPE_LABELS, ancestors, buildTree, descendants,
  formatMilestones, makeCustomSkill, milestoneTemplate, sheetCategory, sheetEntry, unlockStatus,
  validateCustom
} from "./skill-graph.js";
import { treeHtml } from "./tree-export.js";
import { DOMAIN_LABELS, columnList, detailData, domainList, norm } from "./tree-view.js";
import {
  BOOST_DEFAULT_NOTE, BOOST_FORMULAS, BOOST_TARGETS, COND_LABELS, DAMAGE_TYPES,
  RESISTANCE_FORMULA, SKILL_CATEGORIES, toArray
} from "./rules.js";

const MODULE_ID = "isekai-bogen";
const SETTING = "customSkills";
const DATA_URL = `modules/${MODULE_ID}/data/skill-baum.json`;


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

/**
 * Nachschlagewerk Name -> Skill, einmal aufgebaut und bei Aenderungen an den
 * eigenen Skills erneuert. Der Bogen rendert synchron und kann den Baum nicht
 * selbst laden; er braucht aus ihm Schadensarten und Ersetzungen.
 */
let lookup = new Map();
export const treeLookup = () => lookup;

export async function primeTreeLookup() {
  try {
    const tree = buildTree(await loadBase(), customSkills());
    // Im Baum stehen in `replaces` die Ids der Eltern, im Bogen die Namen.
    lookup = new Map(Object.values(tree.skills).map(skill => [norm(skill.name), {
      ...skill,
      replaces: toArray(skill.replaces).map(id => tree.skills[id]?.name || id),
      // Aufgeloest, damit der Bogen die Tabelle nicht selbst erraten muss.
      cat: sheetCategory(skill)
    }]));
  } catch (error) {
    console.error(`${MODULE_ID} | Skill-Baum konnte nicht geladen werden`, error);
  }
  return lookup;
}

export function registerSkillTreeSettings() {
  // Eigene Skills gehören der Welt: der Spielleiter pflegt sie, alle sehen sie.
  game.settings.register(MODULE_ID, SETTING, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => { primeTreeLookup().then(() => SkillTreeApp.refresh()); }
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

    const domains = domainList(tree, state.domain);
    const columns = columnList(tree, {
      domain: state.domain,
      selected: state.selected,
      ownedNames,
      anc,
      desc
    });

    return {
      domains,
      columns,
      query: state.query,
      isGM: game.user.isGM,
      actorName: this.actor?.name || "",
      detail: selected ? detailData(tree, selected.id, {
        owned: ownedList,
        hasActor: Boolean(this.actor),
        actorName: this.actor?.name || "",
        canAdd: Boolean(this.actor?.isOwner)
      }) : null
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
    html.find(".st-export").click(() => this._exportHtml());
    html.find(".st-new").click(() => this._openEditor());
    html.find(".st-edit").click(ev => this._openEditor(ev.currentTarget.dataset.id));
    html.find(".st-delete").click(ev => this._deleteCustom(ev.currentTarget.dataset.id));
  }

  /**
   * Den Baum als eigenstaendige HTML-Datei herunterladen, mit den eigenen
   * Skills dieser Welt. Dieselbe Funktion, die auch die Datei im Projekt
   * erzeugt, damit beide gleich aussehen.
   */
  async _exportHtml() {
    try {
      // Dasselbe Stylesheet, aus dem auch dieses Fenster gebaut wird.
      const antwort = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/templates/skill-tree.html`));
      const template = antwort.ok ? await antwort.text() : "";
      const html = treeHtml(await loadBase(), customSkills(), { template });
      const datum = new Date().toISOString().slice(0, 10);
      saveDataToFile(html, "text/html", `ttrpg-lbds-skill-baum-${datum}.html`);
    } catch (error) {
      console.error(`${MODULE_ID} | Export des Skill-Baums fehlgeschlagen`, error);
      ui.notifications.error("Der Skill-Baum liess sich nicht speichern, Einzelheiten in der Konsole.");
    }
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

    // Startlevel ist der Durchschnitt der Elternlevel, die der Charakter hat.
    const parentLevels = status.parents.filter(parent => parent.has).map(parent => parent.level);
    const entry = sheetEntry(skill, parentLevels, this.tree);

    list.push(entry);
    await actor.update({ "system.isekaiSkills": list });
    ui.notifications.info(`${skill.name} wurde zum Bogen von ${actor.name} hinzugefügt (${skill.floor}, Level ${entry.level}).`);
  }

  // --- Eigene Skills (Spielleiter) ---

  async _openEditor(editId = null, prefill = null) {
    if (!game.user.isGM) return;

    const tree = this.tree;
    // Bearbeiten laesst sich jeder Skill. Bei einem mitgelieferten kommt die
    // Vorlage aus dem Baum; gespeichert wird sie als Ueberschreibung in der
    // Welt, die Datei des Moduls bleibt unberuehrt.
    const existing = editId
      ? (customSkills().find(entry => entry.id === editId) || tree.skills[editId])
      : null;
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
        <label>Eigener Bonus &mdash; Rechenregel
          <select name="bonusMode">
            <option value="" ${value.bonusMode ? "" : "selected"}>nach Kategorie</option>
            ${Object.entries(BOOST_FORMULAS).map(([key, label]) =>
              `<option value="${key}" ${value.bonusMode === key ? "selected" : ""}>${esc(label)}</option>`).join("")}
          </select>
        </label>
        <label>Tabelle im Bogen
          <select name="cat">
            <option value="" ${value.cat ? "" : "selected"}>nach Typ</option>
            ${Object.entries(SKILL_CATEGORIES).map(([key, label]) =>
              `<option value="${key}" ${value.cat === key ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
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
        <label style="grid-column:1 / 3;">Neu pro Rarität
          <span style="color:#64748b; font-size:11px;">&mdash; was der Skill ab dieser Rarität zusätzlich kann.
          Hinter die Zeile schreiben; was leer bleibt, zählt nicht.</span>
          <textarea name="ms" rows="6" style="width:100%;"
            >${esc(milestoneTemplate(value.ms, LEVEL_FLOOR[value.level] || 1, tree.rn))}</textarea></label>

        <div class="st-passive" style="grid-column:1 / 3; ${value.type === "P" ? "" : "display:none;"}">
          <div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px;">
            Resistenz &mdash; nur für passive Skills
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px 12px; margin-bottom:6px;">
            ${Object.entries(DAMAGE_TYPES).map(([key, label]) => `
              <label style="display:flex; gap:5px; align-items:center; margin:0; font-size:12px;">
                <input type="checkbox" name="dtype" value="${key}" style="width:auto; margin:0;"
                  ${(value.types || []).includes(key) ? "checked" : ""}/> ${label}
              </label>`).join("")}
          </div>
          <label>Wirkt nur gegen
            <select name="cond">
              <option value="" ${value.cond ? "" : "selected"}>jede Quelle</option>
              ${Object.entries(COND_LABELS).map(([key, label]) =>
                `<option value="${key}" ${value.cond === key ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
            Schadensreduktion = ${esc(RESISTANCE_FORMULA)}. Ohne Schadensart zählt der Skill nicht zur DR.
          </div>
        </div>

        <div style="grid-column:1 / 3; border-top:1px solid #334155; padding-top:6px;">
          <div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px;">
            Steigert einen anderen Wert
          </div>
          <div style="font-size:11px; color:#94a3b8; margin-bottom:6px;">
            Nicht zu verwechseln mit dem eigenen Bonus oben: der ist, was der Skill selbst wert ist
            (Spalte Bonus im Bogen, Zuschlag auf die eigene Probe). Hier geht es um einen anderen
            Wert, den er nebenbei hebt &mdash; etwa Ausweichen auf den Verteidigungswert.
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <label style="margin:0;">Wert
              <select name="boostTarget" style="width:auto; min-width:140px;">
                <option value="" ${value.boosts?.[0]?.t ? "" : "selected"}>&mdash; keiner &mdash;</option>
                ${Object.entries(BOOST_TARGETS).map(([key, label]) =>
                  `<option value="${key}" ${value.boosts?.[0]?.t === key ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label style="margin:0;">Rechenregel der Steigerung
              <select name="boostFormula" style="width:auto; min-width:180px;">
                ${Object.entries(BOOST_FORMULAS).map(([key, label]) =>
                  `<option value="${key}" ${(value.boosts?.[0]?.f || "standard") === key ? "selected" : ""}>${esc(label)}</option>`).join("")}
              </select>
            </label>
            <label style="margin:0; flex:1 1 200px; min-width:0;">Nur in dieser Lage (optional)
              <input type="text" name="boostSituation" placeholder="z. B. gegen Angriffe von vorn"
                value="${esc(value.boosts?.[0]?.s || "")}"/>
            </label>
          </div>
          <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
            ${esc(BOOST_DEFAULT_NOTE)}
            Ohne Angabe einer Lage rechnet der Bogen die Steigerung von selbst ein;
            mit Angabe wird sie nur genannt, weil der Bogen die Lage nicht kennt.
          </div>
        </div>

        <label style="grid-column:1 / 3;">Legt diese Elternskills still
          <span style="color:#64748b; font-size:11px;">&mdash; nur eigene Eltern, der Wert zählt dann nicht mehr mit</span>
          <div class="st-replaces" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;"></div>
        </label>
      </form>`;

    const collect = (html) => ({
      name: html.find('[name="name"]').val(),
      level: Number(html.find('[name="level"]').val()),
      domain: html.find('[name="domain"]').val(),
      type: html.find('[name="type"]').val(),
      attr: html.find('[name="attr"]').val(),
      res: html.find('[name="res"]').val(),
      cat: html.find('[name="cat"]').val() || "",
      bonusMode: html.find('[name="bonusMode"]').val() || "",
      parents: html.find('input[name="parent"]:checked').map((_, el) => el.value).get(),
      kern: html.find('[name="kern"]').val(),
      ms: html.find('[name="ms"]').val(),
      types: html.find('input[name="dtype"]:checked').map((_, el) => el.value).get(),
      replaces: html.find('input[name="retire"]:checked').map((_, el) => el.value).get(),
      cond: html.find('[name="cond"]').val() || "",
      boosts: html.find('[name="boostTarget"]').val()
        ? [{
          t: html.find('[name="boostTarget"]').val(),
          f: html.find('[name="boostFormula"]').val(),
          s: html.find('[name="boostSituation"]').val()
        }]
        : []
    });

    new Dialog({
      title: editId ? `Eigenen Skill bearbeiten: ${existing.name}` : "Eigenen Skill anlegen",
      content,
      render: (html) => {
        // Die Vorlage beginnt bei der Einstiegsraritaet, die an der Ebene
        // haengt. Geschriebenes bleibt dabei stehen.
        const applyMilestones = () => {
          const level = Number(html.find('[name="level"]').val());
          const feld = html.find('[name="ms"]');
          feld.val(milestoneTemplate(feld.val(), LEVEL_FLOOR[level] || 1, tree.rn));
        };

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
        // Stilllegen ist nur fuer die gewaehlten Eltern moeglich, die Liste
        // folgt deshalb der Elternauswahl.
        const applyReplaces = () => {
          const chosen = html.find('input[name="parent"]:checked').get();
          const keep = new Set(html.find('input[name="retire"]:checked').map((_, el) => el.value).get());
          const box = html.find(".st-replaces");
          if (!chosen.length) {
            box.html('<span style="color:#64748b; font-size:11px;">Erst Elternskills wählen.</span>');
            return;
          }
          box.html(chosen.map(el => {
            const parent = tree.skills[el.value];
            const checked = keep.has(el.value) || (value.replaces || []).includes(el.value);
            return `<label style="display:flex; gap:5px; align-items:center; margin:0; font-size:12px;">
              <input type="checkbox" name="retire" value="${esc(el.value)}" style="width:auto; margin:0;"
                ${checked ? "checked" : ""}/> ${esc(parent?.name || el.value)}</label>`;
          }).join(""));
        };

        // Resistenzfelder nur bei passiven Skills zeigen.
        const applyType = () => {
          html.find(".st-passive").toggle(html.find('[name="type"]').val() === "P");
        };

        html.find('[name="type"]').on("change", applyType);
        html.find('input[name="parent"]').on("change", applyReplaces);
        html.find('[name="level"]').on("change", () => { applyLevel(); applyReplaces(); applyMilestones(); });
        html.find(".par-filter").on("input", ev => {
          const query = norm(ev.currentTarget.value);
          html.find(".par").each((_, row) => { row.style.display = !query || row.dataset.name.includes(query) ? "flex" : "none"; });
        });
        applyLevel();
        applyReplaces();
        applyType();
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
    // Ein mitgelieferter Skill hat noch keinen Eintrag in der Welt; dann wird
    // die Ueberschreibung angelegt statt eine vorhandene ersetzt.
    const next = list.some(old => old.id === id)
      ? list.map(old => old.id === id ? entry : old)
      : [...list, entry];

    this.state.selected = id;
    this.state.domain = entry.domain;
    await game.settings.set(MODULE_ID, SETTING, next);

    if (warnings.length) ui.notifications.warn(warnings.join(" "));
    ui.notifications.info(`Skill „${entry.name}“ gespeichert (Ebene ${entry.level}).`);
  }

  async _deleteCustom(id) {
    if (!game.user.isGM) return;
    const skill = this.tree.skills[id];
    if (!skill) return;

    // Bei einem geaenderten mitgelieferten Skill wird nicht geloescht,
    // sondern die Aenderung verworfen — der Skill selbst bleibt.
    if (skill.changed) {
      const zurueck = await Dialog.confirm({
        title: "Änderung verwerfen?",
        content: `<p>„${esc(skill.name)}“ steht danach wieder so da, wie das Modul ihn mitbringt.</p>`
      });
      if (!zurueck) return;
      await game.settings.set(MODULE_ID, SETTING, customSkills().filter(entry => entry.id !== id));
      return;
    }

    if (!skill.custom) return;

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
