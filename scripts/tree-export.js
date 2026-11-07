// Der Skill-Baum als eigenstaendige HTML-Datei.
//
// Eine Quelle, zwei Wege: tools/build-tree-html.mjs schreibt die Datei aus
// data/skill-baum.json, und der Knopf im Skill-Baum-Fenster erzeugt sie mit
// den eigenen Skills der Welt. Damit kann die Datei nicht veralten, ohne dass
// es auffaellt.
//
// Ohne Foundry lauffaehig, damit der Generator testbar bleibt.
import {
  ARCH_FORMULAS, BOOST_DEFAULT_NOTE, BOOST_TARGETS, DAMAGE_TYPES, MACHTFAKTOR_MAP, RARITY_MAP,
  BONUS_MODES, RESISTANCE_FORMULA, SKILL_BONUS_FORMULAS, SKILL_CATEGORIES, condLabel, rarityRank,
  skillBoosts, typeLabels
} from "./rules.js";
import { LEVEL_REQ, TYPE_LABELS, buildTree, effectLines } from "./skill-graph.js";
import { sheetCategory } from "./skill-graph.js";

const DOMAIN_LABELS = {
  waffen: "Waffen", verteidigung: "Verteidigung", spezial: "Spezialangriffe", magie: "Magie",
  wissen: "Wissen", herstellung: "Herstellung", resistenz: "Resistenz", allgemein: "Allgemein",
  kombi: "Verschmelzungen"
};

const esc = (text) => String(text ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

// Beispiel-Level, damit eine Zahl konkret wird statt nur eine Formel.
const BEISPIEL_LEVEL = 10;

const STYLE = `
:root {
  --papier: #ffffff; --text: #1e293b; --leise: #64748b; --linie: #cbd5e1;
  --kasten: #f8fafc; --akzent: #0369a1;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0 16px 48px; background: var(--papier); color: var(--text);
  font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5;
}
.huelle { max-width: 1000px; margin: 0 auto; }
header { padding: 28px 0 12px; border-bottom: 2px solid var(--text); margin-bottom: 20px; }
h1 { margin: 0 0 4px; font-size: 26px; }
.stand { color: var(--leise); font-size: 13px; }
h2 {
  margin: 32px 0 8px; font-size: 19px; padding-bottom: 4px;
  border-bottom: 1px solid var(--linie);
}
h3 { margin: 20px 0 6px; font-size: 15px; color: var(--leise); font-weight: 600; }
.regeln { background: var(--kasten); border: 1px solid var(--linie); border-radius: 4px; padding: 12px 16px; }
.regeln dt { font-weight: 600; margin-top: 8px; }
.regeln dt:first-child { margin-top: 0; }
.regeln dd { margin: 0 0 0 0; color: var(--text); }
.suche { margin: 16px 0; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.suche input { padding: 6px 10px; font-size: 14px; border: 1px solid var(--linie); border-radius: 4px; min-width: 240px; }
.suche label { font-size: 13px; color: var(--leise); }
.skill {
  border: 1px solid var(--linie); border-left: 4px solid var(--akzent); border-radius: 4px;
  padding: 10px 14px; margin-bottom: 10px; background: var(--papier);
}
.skill.eigen { border-left-color: #b45309; background: #fffbeb; }
.kopf { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.kopf .name { font-weight: 700; font-size: 16px; }
.marke {
  font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--leise);
  border: 1px solid var(--linie); border-radius: 10px; padding: 1px 7px; white-space: nowrap;
}
.kern { margin: 6px 0 0; }
.zeile { font-size: 13px; margin-top: 5px; }
.zeile b { color: var(--leise); font-weight: 600; }
.leiter { margin-top: 7px; font-size: 13px; }
.leiter div { padding: 2px 0 2px 10px; border-left: 2px solid var(--linie); }
.leiter .r { font-weight: 600; display: inline-block; min-width: 108px; }
.zusatz { color: var(--leise); }
table.uebersicht { border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 8px; }
table.uebersicht th, table.uebersicht td { border: 1px solid var(--linie); padding: 4px 7px; text-align: left; }
table.uebersicht th { background: var(--kasten); }
.verborgen { display: none !important; }
@media print {
  body { font-size: 11pt; padding: 0; }
  .suche { display: none; }
  .skill { break-inside: avoid; page-break-inside: avoid; }
  h2 { break-after: avoid; }
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --papier: #0f172a; --text: #e2e8f0; --leise: #94a3b8; --linie: #334155;
    --kasten: #1e293b; --akzent: #38bdf8;
  }
  :root:not([data-theme="light"]) .skill.eigen { background: #292218; border-left-color: #f59e0b; }
}
`;

const SKRIPT = `
const feld = document.getElementById("suche");
const nurEigene = document.getElementById("nur-eigene");
function filtern() {
  const frage = feld.value.trim().toLowerCase();
  const eigene = nurEigene.checked;
  for (const skill of document.querySelectorAll(".skill")) {
    const passt = (!frage || skill.dataset.suchtext.includes(frage))
      && (!eigene || skill.dataset.eigen === "1");
    skill.classList.toggle("verborgen", !passt);
  }
  for (const block of document.querySelectorAll("[data-block]")) {
    const sichtbar = block.querySelectorAll(".skill:not(.verborgen)").length;
    block.classList.toggle("verborgen", sichtbar === 0);
  }
}
feld.addEventListener("input", filtern);
nurEigene.addEventListener("change", filtern);
`;

function skillBlock(tree, skill) {
  const marken = [
    `Ebene ${skill.level}`,
    `ab ${skill.floor}`,
    DOMAIN_LABELS[skill.domain] || skill.domain,
    TYPE_LABELS[skill.type],
    skill.attr,
    skill.kind,
    SKILL_CATEGORIES[sheetCategory(skill)]
  ];
  if (skill.res) marken.push(`Kosten ${skill.res}`);
  if (skill.custom) marken.push("eigener Skill");

  const zeilen = [];

  const eltern = skill.parents.map(id => tree.skills[id]?.name).filter(Boolean);
  if (eltern.length) {
    zeilen.push(`<div class="zeile"><b>Voraussetzung:</b> ${esc(eltern.join(", "))}` +
      ` <span class="zusatz">(je ab Level ${LEVEL_REQ[skill.level] ?? 0})</span></div>`);
  }

  const kinder = skill.children.map(id => tree.skills[id]?.name).filter(Boolean);
  if (kinder.length) {
    zeilen.push(`<div class="zeile"><b>Führt zu:</b> ${esc(kinder.join(", "))}</div>`);
  }

  const arten = typeLabels(skill.types);
  if (arten.length) {
    zeilen.push(`<div class="zeile"><b>Schadensreduktion gegen:</b> ${esc(arten.join(", "))}` +
      (skill.cond ? ` <span class="zusatz">nur gegen ${esc(condLabel(skill.cond))}</span>` : "") +
      ` <span class="zusatz">— ${esc(RESISTANCE_FORMULA)}, bei Level ${BEISPIEL_LEVEL} und ${skill.floor}:` +
      ` ${BEISPIEL_LEVEL * MACHTFAKTOR_MAP[skill.floor]}</span></div>`);
  }

  const ersetzt = skill.replaces.map(id => tree.skills[id]?.name || id);
  if (ersetzt.length) {
    zeilen.push(`<div class="zeile"><b>Legt still:</b> ${esc(ersetzt.join(", "))}` +
      ` <span class="zusatz">zählt dann nicht mehr mit</span></div>`);
  }

  const steigerungen = skillBoosts({ ...skill, level: BEISPIEL_LEVEL, rarity: skill.floor });
  if (steigerungen.length) {
    const text = steigerungen.map(boost =>
      `${boost.lowers ? "−" : "+"}${boost.amount} ${BOOST_TARGETS[boost.target]}` +
      (boost.situation ? ` (nur ${esc(boost.situation)})` : "")).join(", ");
    zeilen.push(`<div class="zeile"><b>Steigert:</b> ${text}` +
      ` <span class="zusatz">bei Level ${BEISPIEL_LEVEL} und ${skill.floor}</span></div>`);
  }

  const formel = ARCH_FORMULAS[skill.arch];
  if (formel) zeilen.push(`<div class="zeile"><b>Rechenregel:</b> ${esc(formel)}</div>`);

  if (BONUS_MODES[skill.bonusMode]) {
    zeilen.push(`<div class="zeile"><b>Bonus vervielfacht mit:</b> ` +
      `${esc(BONUS_MODES[skill.bonusMode])}</div>`);
  }

  const leiter = effectLines(tree, skill.id).map(zeile =>
    `<div><span class="r">${esc(zeile.rarity)}</span> ${esc(zeile.base)}` +
    (zeile.extra ? ` <span class="zusatz">Dazu: ${esc(zeile.extra)}</span>` : "") + `</div>`).join("");

  const suchtext = [skill.name, skill.kern, DOMAIN_LABELS[skill.domain], ...eltern, ...arten]
    .join(" ").toLowerCase();

  return `
    <div class="skill${skill.custom ? " eigen" : ""}" data-eigen="${skill.custom ? 1 : 0}"
         data-suchtext="${esc(suchtext)}">
      <div class="kopf">
        <span class="name">${esc(skill.name)}</span>
        ${marken.map(marke => `<span class="marke">${esc(marke)}</span>`).join("")}
      </div>
      <p class="kern">${esc(skill.kern)}</p>
      ${zeilen.join("")}
      ${leiter ? `<div class="leiter">${leiter}</div>` : ""}
    </div>`;
}

/**
 * Der ganze Baum als HTML-Dokument. `customs` sind die eigenen Skills der
 * Welt; ohne sie entsteht nur der Grundbestand.
 */
export function treeHtml(base, customs = [], { stand = new Date() } = {}) {
  const tree = buildTree(base, customs);
  const eigene = tree.order.filter(id => tree.skills[id].custom).length;

  const bereiche = base.doms
    .map(domain => ({
      domain,
      label: DOMAIN_LABELS[domain] || domain,
      skills: tree.order.map(id => tree.skills[id]).filter(skill => skill.domain === domain)
    }))
    .filter(bereich => bereich.skills.length);

  const abschnitte = bereiche.map(bereich => {
    const ebenen = [...new Set(bereich.skills.map(skill => skill.level))].sort((a, b) => a - b);
    const inhalt = ebenen.map(level => {
      const skills = bereich.skills
        .filter(skill => skill.level === level)
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
      return `<div data-block="ebene"><h3>Ebene ${level}</h3>` +
        skills.map(skill => skillBlock(tree, skill)).join("") + `</div>`;
    }).join("");
    return `<section data-block="bereich"><h2>${esc(bereich.label)}` +
      ` <span class="stand">${bereich.skills.length} Skills</span></h2>${inhalt}</section>`;
  }).join("");

  const raritaeten = Object.keys(RARITY_MAP).map(name =>
    `<tr><td>${esc(name)}</td><td>${rarityRank(name)}</td>` +
    `<td>${MACHTFAKTOR_MAP[name]}</td></tr>`).join("");

  const boni = Object.entries(SKILL_BONUS_FORMULAS).map(([key, formel]) =>
    `<tr><td>${esc(SKILL_CATEGORIES[key])}</td><td>${esc(formel)}</td></tr>`).join("");

  const datum = stand.toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TTRPG-LBDS Skill-Baum</title>
<style>${STYLE}</style>
</head>
<body>
<div class="huelle">
<header>
  <h1>TTRPG-LBDS &mdash; Skill-Baum</h1>
  <div class="stand">
    Stand ${datum} &middot; ${tree.order.length} Skills in ${bereiche.length} Bereichen
    ${eigene ? `&middot; davon ${eigene} eigene` : "&middot; ohne eigene Skills"}
  </div>
</header>

<section class="regeln">
  <h2 style="margin-top:0; border:0; padding:0;">Die Regeln, einmal</h2>
  <dl>
    <dt>Skill-Bonus</dt>
    <dd><table class="uebersicht"><tr><th>Kategorie</th><th>Bonus</th></tr>${boni}</table></dd>
    <dt>Raritaet</dt>
    <dd><table class="uebersicht">
      <tr><th>Rarität</th><th>Stufe</th><th>Machtfaktor / Machtstufe</th></tr>
      ${raritaeten}
    </table>
    Der Machtfaktor vervielfacht Schadenswürfel und Resistenzen. Dieselbe Zahl heißt beim
    Flächenangriff Machtstufe und bestimmt dessen Ausdehnung. Der AW eines Angriffs rechnet
    dagegen mit der Raritätsstufe: Skill-Level × Stufe.</dd>
    <dt>Schadensreduktion</dt>
    <dd>${esc(RESISTANCE_FORMULA)}. Mehrere Resistenzen addieren sich, es gibt keinen Deckel.
    Schadensarten: ${Object.values(DAMAGE_TYPES).join(", ")}.</dd>
    <dt>Steigerungen</dt>
    <dd>${esc(BOOST_DEFAULT_NOTE)} Eine Steigerung mit Lage zählt nur dort und wird im
    Bogen nicht mitgerechnet.</dd>
    <dt>Abgeleitete Skills</dt>
    <dd>Das Startlevel ist der abgerundete Durchschnitt der Elternlevel. Jeder Elternskill
    muss das Level haben, das die Ebene verlangt.</dd>
  </dl>
</section>

<div class="suche">
  <input type="search" id="suche" placeholder="Skill, Beschreibung oder Schadensart suchen &hellip;"/>
  <label><input type="checkbox" id="nur-eigene"/> nur eigene Skills</label>
  <span class="stand">Die Zahl in jeder Marke sagt, wo der Skill im Bogen landet.</span>
</div>

${abschnitte}

</div>
<script>${SKRIPT}</script>
</body>
</html>
`;
}
