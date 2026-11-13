// Der Skill-Baum als eigenstaendige HTML-Datei.
//
// Sie sieht aus und arbeitet wie das Fenster in Foundry: dieselben Reiter,
// dieselben Spalten je Ebene, dieselbe Suche, dasselbe Detail rechts. Dafuer
// kommt das Stylesheet aus templates/skill-tree.html und die Aufbereitung aus
// tree-view.js — genau die Quellen, aus denen auch das Fenster gebaut wird.
//
// Zwei Wege, ein Generator: tools/build-tree-html.mjs schreibt die Datei aus
// data/skill-baum.json, und der Knopf "Als HTML speichern" im Fenster erzeugt
// sie mit den eigenen Skills der Welt.
//
// Ohne Foundry lauffaehig, damit der Generator testbar bleibt.
import {
  BOOST_DEFAULT_NOTE, DAMAGE_TYPES, MACHTFAKTOR_MAP, RARITY_MAP, RESISTANCE_FORMULA,
  SKILL_BONUS_FORMULAS, SKILL_CATEGORIES, rarityRank
} from "./rules.js";
import { buildTree } from "./skill-graph.js";
import { columnList, detailData, domainList, norm, relations } from "./tree-view.js";

const esc = (text) => String(text ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/**
 * Das Stylesheet des Fensters. Wird aus dem Template gelesen, damit die Datei
 * nicht anders aussieht, sobald dort etwas geaendert wird.
 */
export function styleFromTemplate(template) {
  const match = /<style>([\s\S]*?)<\/style>/.exec(String(template || ""));
  return match ? match[1] : "";
}

// Was im Fenster die Fensterdekoration von Foundry leistet.
const RAHMEN = `
  html, body { height: 100%; }
  body {
    margin: 0; background: #0f172a; color: #e2e8f0; overflow: hidden;
    font-family: "Signika", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px;
  }
  .st-root { height: 100vh; }
  .st-stand { color: #64748b; font-size: 11px; margin-left: auto; padding-right: 4px; }
  .st-regeln { padding: 10px 12px; border-top: 1px solid #334155; }
  .st-regeln table { border-collapse: collapse; font-size: 11px; margin: 4px 0 8px; }
  .st-regeln th, .st-regeln td { border: 1px solid #334155; padding: 2px 6px; text-align: left; }
  .st-regeln th { color: #94a3b8; font-weight: 600; }
  .st-regeln dt { color: #cbd5e1; font-weight: 600; margin-top: 6px; }
  .st-regeln dd { margin: 0; color: #94a3b8; }
  @media print {
    body { overflow: visible; background: #fff; color: #000; }
    .st-root, .st-body { height: auto; display: block; }
    .st-columns, .st-detail { overflow: visible; }
    .st-top { position: static; }
  }
`;

// --- Das Detail, mit denselben Klassen wie templates/skill-tree.html --------
function detailHtml(detail) {
  const links = (list, extra = () => "") => `<div class="st-links">` +
    list.map(entry => `<a class="st-link r-${esc(entry.rarity)}" data-id="${esc(entry.id)}"` +
      `${extra(entry)}>${esc(entry.name)}</a>`).join("") + `</div>`;

  const teile = [
    `<h3>${esc(detail.name)}</h3>`,
    `<div class="st-meta">Ebene ${detail.level} · ab ${esc(detail.floor)} · ${esc(detail.domainLabel)}` +
      ` · ${esc(detail.attr)} · ${esc(detail.typeLabel)}` +
      `${detail.res ? ` · Kosten ${esc(detail.res)}` : ""} · ${esc(detail.kind)}` +
      `${detail.custom ? " · eigener Skill" : ""}</div>`,
    `<div class="st-meta">Im Bogen unter &bdquo;${esc(detail.categoryLabel)}&ldquo;</div>`,
    `<p>${esc(detail.kern)}</p>`
  ];

  if (detail.parents.length) {
    teile.push(`<h5>Voraussetzung (Elternskills ab Level ${detail.needed})</h5>`);
    teile.push(links(detail.parents, entry => ` title="${esc(entry.hint)}"`));
  }
  if (detail.ancestors.length) {
    teile.push(`<h5>Enthält (${detail.ancestors.length} Vorstufen)</h5>`);
    teile.push(links(detail.ancestors));
  }
  if (detail.children.length) {
    teile.push(`<h5>Führt weiter zu</h5>`);
    teile.push(links(detail.children));
  }

  teile.push(`<h5>${detail.payoff.sample ? "Was der Skill bringt (Beispiel)" : "Was der Skill dir bringt"}</h5>`);
  teile.push(`<div class="st-payoff"><div class="st-payoff-head">${esc(detail.payoff.head)}</div>` +
    detail.payoff.lines.map(line => `<div>${line}</div>`).join("") + `</div>`);

  if (detail.formula) teile.push(`<p class="st-note" style="margin-top:6px;">${esc(detail.formula)}</p>`);
  if (detail.bonusModeLabel) {
    teile.push(`<p class="st-note">Eigener Bonus nach eigener Regel: ${esc(detail.bonusModeLabel)}.</p>`);
  }

  teile.push(`<h5>Was jede Rarität bringt</h5>`);
  teile.push(detail.effects.map(zeile =>
    `<div class="st-eff r-${esc(zeile.rarity)}"><b>${esc(zeile.rarity)}</b> ${esc(zeile.base)}` +
    (zeile.extra ? `<div class="extra">Neu bei dieser Rarität: ${esc(zeile.extra)}</div>` : "") +
    `</div>`).join(""));

  return teile.join("\n");
}

const LEER = `<div class="st-empty">
  <b>Skill wählen</b><br>
  Klick auf einen Skill zeigt Wirkung, Voraussetzungen und alle enthaltenen Vorstufen.
  Blau markiert sind die Vorstufen, gelb die Skills, die darauf aufbauen.
</div>`;

// --- Das Verhalten in der Datei: Reiter, Suche, Auswahl --------------------
const SKRIPT = `
const wurzel = document.querySelector(".st-root");
const spalten = wurzel.querySelector(".st-columns");
const detail = wurzel.querySelector(".st-detail");
const suche = wurzel.querySelector(".st-search");
const stand = { domain: "alle", query: "", selected: null };

function zeichneSpalten() {
  const markiert = stand.selected ? DATEN.rel[stand.selected] : null;
  const anc = new Set(markiert ? markiert.anc : []);
  const desc = new Set(markiert ? markiert.desc : []);

  spalten.innerHTML = DATEN.spalten[stand.domain].map(spalte => {
    const kaestchen = spalte.skills.map(skill => {
      const klassen = ["st-chip", "r-" + skill.rarity];
      if (skill.custom) klassen.push("custom");
      if (skill.extern) klassen.push("extern");
      if (skill.id === stand.selected) klassen.push("sel");
      else if (anc.has(skill.id)) klassen.push("anc");
      else if (desc.has(skill.id)) klassen.push("desc");
      if (stand.query && !skill.lname.includes(stand.query)) klassen.push("hidden");
      return '<a class="' + klassen.join(" ") + '" data-id="' + skill.id +
        '" data-name="' + skill.lname + '" title="' + skill.title + '">' + skill.name + "</a>";
    }).join("");
    return '<div class="st-col"><h4>Ebene ' + spalte.level + "<small>ab " + spalte.floor +
      (spalte.req ? " \\u00b7 Eltern ab Level " + spalte.req : "") + "</small></h4>" + kaestchen + "</div>";
  }).join("");
}

function zeichneDetail() {
  detail.innerHTML = stand.selected ? DATEN.detail[stand.selected] : DATEN.leer;
  detail.scrollTop = 0;
}

function waehle(id) {
  if (!DATEN.detail[id]) return;
  stand.selected = id;
  // Ein Skill aus einem anderen Bereich bringt den Bereich mit.
  const bereich = DATEN.bereichVon[id];
  if (stand.domain !== "alle" && bereich !== stand.domain) stand.domain = bereich;
  zeichnen();
}

function zeichnen() {
  for (const reiter of wurzel.querySelectorAll(".st-tab")) {
    reiter.classList.toggle("active", reiter.dataset.domain === stand.domain);
  }
  zeichneSpalten();
  zeichneDetail();
}

wurzel.addEventListener("click", event => {
  const reiter = event.target.closest(".st-tab");
  if (reiter) { stand.domain = reiter.dataset.domain; zeichnen(); return; }
  const kaestchen = event.target.closest(".st-chip, .st-link");
  if (kaestchen) { waehle(kaestchen.dataset.id); }
});

suche.addEventListener("input", () => {
  stand.query = suche.value.trim().toLowerCase();
  zeichneSpalten();
});

zeichnen();
`;

/**
 * Der ganze Baum als HTML-Dokument. `customs` sind die eigenen Skills der
 * Welt; `template` ist der Text von templates/skill-tree.html, aus dem das
 * Stylesheet kommt.
 */
export function treeHtml(base, customs = [], { template = "", stand = new Date(), fragment = false } = {}) {
  const tree = buildTree(base, customs);
  const eigene = tree.order.filter(id => tree.skills[id].custom).length;

  const bereiche = domainList(tree, "alle");

  // Die Spalten je Reiter einmal vorbereiten, damit die Datei nichts rechnen
  // muss, was hier schon bekannt ist.
  const spalten = {};
  for (const bereich of bereiche) {
    spalten[bereich.key] = columnList(tree, { domain: bereich.key }).map(spalte => ({
      level: spalte.level,
      floor: spalte.floor,
      req: spalte.req,
      skills: spalte.skills.map(skill => ({
        id: skill.id,
        name: esc(skill.name),
        lname: skill.lname,
        rarity: skill.rarity,
        title: esc(skill.title),
        custom: Boolean(tree.skills[skill.id].custom),
        // Alle Voraussetzungen liegen in anderen Bereichen.
        extern: skill.cls.split(" ").includes("extern")
      }))
    }));
  }

  const detail = {};
  const bereichVon = {};
  for (const id of tree.order) {
    detail[id] = detailHtml(detailData(tree, id));
    bereichVon[id] = tree.skills[id].domain;
  }

  const daten = {
    spalten,
    detail,
    rel: relations(tree),
    bereichVon,
    leer: LEER
  };

  const raritaeten = Object.keys(RARITY_MAP).map(name =>
    `<tr><td>${esc(name)}</td><td>${rarityRank(name)}</td><td>${MACHTFAKTOR_MAP[name]}</td></tr>`).join("");
  const boni = Object.entries(SKILL_BONUS_FORMULAS).map(([key, formel]) =>
    `<tr><td>${esc(SKILL_CATEGORIES[key])}</td><td>${esc(formel)}</td></tr>`).join("");

  const datum = stand.toISOString().slice(0, 10);

  // Als Artifact-Seite kommt das Dokumentgeruest von der Plattform; dann
  // faengt die Datei direkt mit Titel und Stylesheet an.
  const kopf = fragment
    ? `<title>TTRPG-LBDS Skill-Baum</title>
<style>
:root { color-scheme: dark; }
html, body { height: 100%; }
.st-root { height: 100%; }
${styleFromTemplate(template)}
${RAHMEN}
</style>`
    : `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TTRPG-LBDS Skill-Baum</title>
<style>
${styleFromTemplate(template)}
${RAHMEN}
</style>
</head>
<body>`;

  const fuss = fragment ? "" : `
</body>
</html>`;

  return `${kopf}
<div class="st-root">
  <header class="st-top">
    <div class="st-tabs">
      ${bereiche.map(bereich =>
        `<a class="st-tab${bereich.active ? " active" : ""}" data-domain="${esc(bereich.key)}">${esc(bereich.label)}</a>`).join("")}
    </div>
    <input class="st-search" type="search" placeholder="Skill suchen &hellip;"/>
    <span class="st-stand">Stand ${datum} · ${tree.order.length} Skills${eigene ? ` · ${eigene} eigene` : ""}</span>
  </header>

  <div class="st-body">
    <section class="st-columns"></section>
    <aside class="st-detail"></aside>
  </div>
</div>

<section class="st-regeln">
  <dl>
    <dt>Skill-Bonus</dt>
    <dd><table><tr><th>Kategorie</th><th>Bonus</th></tr>${boni}</table></dd>
    <dt>Rarität</dt>
    <dd><table><tr><th>Rarität</th><th>Stufe</th><th>Machtfaktor / Machtstufe</th></tr>${raritaeten}</table>
      Der Machtfaktor vervielfacht Schadenswürfel und Resistenzen. Dieselbe Zahl heißt beim
      Flächenangriff Machtstufe. Der AW eines Angriffs rechnet mit Skill-Level × Raritätsstufe.</dd>
    <dt>Schadensreduktion</dt>
    <dd>${esc(RESISTANCE_FORMULA)}. Mehrere Resistenzen addieren sich, es gibt keinen Deckel.
      Schadensarten: ${esc(Object.values(DAMAGE_TYPES).join(", "))}.</dd>
    <dt>Steigerungen</dt>
    <dd>${esc(BOOST_DEFAULT_NOTE)} Eine Steigerung mit Lage zählt nur dort und wird im Bogen
      nicht mitgerechnet.</dd>
    <dt>Abgeleitete Skills</dt>
    <dd>Das Startlevel ist der abgerundete Durchschnitt der Elternlevel. Jeder Elternskill muss das
      Level haben, das die Ebene verlangt.</dd>
  </dl>
</section>

<script id="st-daten" type="application/json">${JSON.stringify(daten).replace(/<\//g, "<\\/")}</script>
<script>
const DATEN = JSON.parse(document.getElementById("st-daten").textContent);
${SKRIPT}
</script>${fuss}
`;
}

export { norm };
