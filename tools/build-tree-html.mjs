// Schreibt den Skill-Baum als eigenstaendige HTML-Datei.
//
//   node tools/build-tree-html.mjs [quelldatei] [zieldatei]
//
// Mit --fragment entsteht eine Fassung ohne eigenes Dokumentgeruest, wie sie
// eine Artifact-Seite braucht; dort kommt der Rahmen von der Plattform.
//
// Enthaelt den Grundbestand aus data/skill-baum.json. Die eigenen Skills einer
// Welt stehen in Foundry, nicht hier: die holt der Knopf "Als HTML speichern"
// im Skill-Baum-Fenster, der dieselbe Funktion benutzt.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treeHtml } from "../scripts/tree-export.js";

const root = join(import.meta.dirname, "..");
const fragment = process.argv.includes("--fragment");
const argumente = process.argv.slice(2).filter(wert => wert !== "--fragment");
const quelle = argumente[0] || "data/skill-baum.json";
const ziel = argumente[1] || join(root, "ttrpg-lbds-skill-tree.html");
const base = JSON.parse(readFileSync(join(root, quelle), "utf8"));

// Das Stylesheet kommt aus dem Fenster-Template, damit die Datei genauso
// aussieht wie der Baum im Bogen.
const template = readFileSync(join(root, "templates/skill-tree.html"), "utf8");
const html = treeHtml(base, [], { template, fragment });
writeFileSync(ziel, html, "utf8");

console.log(`${ziel}`);
console.log(`${Object.keys(base.skills).length} Skills, ${(html.length / 1024).toFixed(0)} KB`);
