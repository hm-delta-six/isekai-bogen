// Schreibt den Skill-Baum als eigenstaendige HTML-Datei.
//
//   node tools/build-tree-html.mjs [zieldatei]
//
// Enthaelt den Grundbestand aus data/skill-baum.json. Die eigenen Skills einer
// Welt stehen in Foundry, nicht hier: die holt der Knopf "Als HTML speichern"
// im Skill-Baum-Fenster, der dieselbe Funktion benutzt.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treeHtml } from "../scripts/tree-export.js";

const root = join(import.meta.dirname, "..");
const ziel = process.argv[2] || join(root, "ttrpg-lbds-skill-tree.html");
const base = JSON.parse(readFileSync(join(root, "data/skill-baum.json"), "utf8"));

const html = treeHtml(base, []);
writeFileSync(ziel, html, "utf8");

console.log(`${ziel}`);
console.log(`${Object.keys(base.skills).length} Skills, ${(html.length / 1024).toFixed(0)} KB`);
