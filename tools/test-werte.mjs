// Prueft die konkreten Werte je Raritaet: Reichweite, Wirkung, Kosten.
//
// Ein Skill ohne `werte` zeigt weiter die Staffel seiner Art — das ist
// erlaubt, solange sein Bereich noch nicht umgeschrieben ist. Ein Skill MIT
// `werte` muss aber vollstaendig sein: fuer jede Raritaet ab seiner
// Einstiegsraritaet eine bezifferte Wirkung und eine Kostenangabe.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effectValue } from "../scripts/rules.js";
import { buildTree, effectLines, makeCustomSkill, RARITY_LETTERS } from "../scripts/skill-graph.js";
import { detailData } from "../scripts/tree-view.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(join(root, "data/skill-baum.json"), "utf8"));

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  erwartet ${JSON.stringify(want)}\n  bekommen ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
};

const tree = buildTree(base);
const mitWerten = tree.order.map(id => tree.skills[id]).filter(skill => skill.werte?.st);

check("mindestens ein Bereich ist umgeschrieben", mitWerten.length > 0, true);

// --- Vollstaendigkeit ---
const ohneReichweite = mitWerten.filter(skill => !skill.werte.rw.trim()).map(skill => skill.id);
check("jeder Skill mit Werten nennt eine Reichweite", ohneReichweite, []);

const luecken = [];
const unbeziffert = [];
const platzhalter = [];
const ohneKosten = [];
const zuTief = [];

for (const skill of mitWerten) {
  for (let rang = skill.fl; rang <= 6; rang++) {
    const brief = RARITY_LETTERS[rang - 1];
    const stufe = skill.werte.st[brief];
    if (!stufe) { luecken.push(`${skill.id}/${brief}`); continue; }
    if (!String(stufe.w || "").trim()) { luecken.push(`${skill.id}/${brief}`); continue; }
    if (!/\d/.test(stufe.w)) unbeziffert.push(`${skill.id}/${brief}`);
    // Die Raritaetsstufe ist eingerechnet, ihr Name darf nicht als
    // Rechenanweisung im Text stehen.
    if (/Rarität|Raritätsstufe|Machtfaktor/i.test(stufe.w)) platzhalter.push(`${skill.id}/${brief}`);
    if (!String(stufe.k || "").trim()) ohneKosten.push(`${skill.id}/${brief}`);
  }
  for (const brief of Object.keys(skill.werte.st)) {
    if (RARITY_LETTERS.indexOf(brief) + 1 < skill.fl) zuTief.push(`${skill.id}/${brief}`);
  }
}

check("keine Raritaet fehlt", luecken, []);
check("jede Wirkung nennt eine Zahl", unbeziffert, []);
check("keine Wirkung rechnet mit der Raritaet als Wort", platzhalter, []);

// Das passende Attribut gehoert in den Primaereffekt: halb, abgerundet. Es
// muss in der Einstiegsraritaet stehen; die hoeheren Zeilen schreiben nur,
// was sich aendert, und duerfen es weglassen, wenn sich die Zahl nicht ruehrt.
const ohneAttribut = [];
for (const skill of mitWerten) {
  const brief = RARITY_LETTERS[skill.fl - 1];
  const einstieg = skill.werte.st[brief];
  if (einstieg && !String(einstieg.w).includes(skill.attr)) {
    ohneAttribut.push(`${skill.id}/${brief}`);
  }
}
check("die Einstiegsraritaet nennt das Attribut des Skills", ohneAttribut, []);

// Die Zeilen zaehlen zusammen: keine wiederholt den ersten Satz der Zeile
// darunter wortgleich.
const ersterSatz = (text) => String(text).split(/(?<=\.)\s+/)[0].trim();
const wiederholt = [];
for (const skill of mitWerten) {
  let vorher = "";
  for (let rang = skill.fl; rang <= 6; rang++) {
    const brief = RARITY_LETTERS[rang - 1];
    const stufe = skill.werte.st[brief];
    if (!stufe) continue;
    if (vorher && ersterSatz(stufe.w) === vorher) wiederholt.push(`${skill.id}/${brief}`);
    vorher = ersterSatz(stufe.w);
  }
}
check("keine Raritaet wiederholt die Zeile darunter", wiederholt, []);
check("die Formel rechnet das Attribut halb",
  effectValue({ level: 10, rarity: "Rare", attribute: 16 }), 54);
check("ein ungerades Attribut wird abgerundet",
  effectValue({ level: 10, rarity: "Common", attribute: 5 }), 12);
check("jede Raritaet nennt Kosten", ohneKosten, []);
check("keine Raritaet unter der Einstiegsraritaet", zuTief, []);

// --- Weg in die Anzeige ---
const probe = mitWerten[0];
const zeilen = effectLines(tree, probe.id);
check("eine Zeile je Raritaet ab der Einstiegsraritaet", zeilen.length, 7 - probe.fl);
check("die Zeile tragt die Wirkung aus den Werten", zeilen[0].base, probe.werte.st[RARITY_LETTERS[probe.fl - 1]].w);
check("die Zeile tragt die Kosten", zeilen[0].kosten, probe.werte.st[RARITY_LETTERS[probe.fl - 1]].k);
check("die Staffel der Art steht nicht mehr darin", zeilen[0].base === (tree.lad[probe.arch] || [])[probe.fl - 1], false);

const detail = detailData(tree, probe.id);
check("das Detail weiss von den Werten", detail.hatWerte, true);
check("das Detail nennt die Reichweite", detail.reichweite, probe.werte.rw);
check("das Detail laesst das Beispiel weg", detail.payoff, null);
check("die Formel der Art entfaellt", detail.formula, "");

// Ein Skill ohne Werte behaelt Staffel und Beispiel.
const ohne = tree.order.map(id => tree.skills[id]).find(skill => !skill.werte);
const altDetail = detailData(tree, ohne.id);
check("ohne Werte bleibt das Beispiel", Boolean(altDetail.payoff), true);
check("ohne Werte bleibt die Staffel", effectLines(tree, ohne.id)[0].base,
  (tree.lad[ohne.arch] || [])[ohne.fl - 1] || "");
check("ohne Werte nennt die Zeile keine Kosten", effectLines(tree, ohne.id)[0].kosten, "");

// --- Der Hinweis ueber der Tabelle ---
// Mit Werten: die Zeilen zaehlen zusammen. Ohne Werte: Platzhalter.
const { WERTE_NOTE, LADDER_NOTE } = await import("../scripts/rules.js");
check("mit Werten steht der additive Hinweis", detail.werteNote, WERTE_NOTE);
check("ohne Werte steht der Platzhalter-Hinweis", altDetail.werteNote, LADDER_NOTE);

// --- Ausbessern: der Flickzauber hat ein Kind auf Ebene 2 ---
const ausbessern = tree.skills.mag_ausbessern;
check("Ausbessern steht im Baum", Boolean(ausbessern), true);
check("Ausbessern sitzt auf Ebene 2", ausbessern.level, 2);
check("Ausbessern stammt vom Flickzauber", ausbessern.parents, ["mag_flicken"]);
check("Ausbessern beginnt bei Common", ausbessern.floor, "Common");
check("Ausbessern hat Werte ab Common", Object.keys(ausbessern.werte.st), ["C", "U", "R", "E", "L", "T"]);
check("fehlende Teile erst ab Rare",
  [ausbessern.werte.st.C.w.includes("alle Teile da"),
   ausbessern.werte.st.R.w.includes("Fehlt")], [true, true]);
check("Flickzauber hat jetzt ein Kind auf Ebene 2",
  tree.skills.mag_flicken.children.filter(id => tree.skills[id].level === 2), ["mag_ausbessern"]);

// --- Bearbeiten darf die Werte nicht verlieren ---
const bearbeitet = makeCustomSkill({
  name: probe.name, level: probe.level, domain: probe.domain, type: probe.type, attr: probe.attr,
  res: probe.res, parents: probe.parents, kern: "neu getippt", ms: "", werte: probe.werte
}, probe.id);
check("die Werte ueberleben das Formular", bearbeitet.werte.st, probe.werte.st);
const nachBearbeitung = buildTree(base, [bearbeitet]);
check("der ueberschriebene Skill zeigt weiter seine Werte",
  effectLines(nachBearbeitung, probe.id)[0].kosten, zeilen[0].kosten);

console.log(fails ? `\n${fails} Fehler` : "\nalles gruen");
process.exit(fails ? 1 : 0);
