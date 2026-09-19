// Prüft, dass jeder Klick-Listener eine Klasse im Template findet und
// umgekehrt jede Handler-Klasse im Template einen Listener hat.
//
// Hintergrund: der Listener suchte .pick-types, im Template stand .typepick.
// Beides für sich war fehlerfrei, nur zueinander passten sie nicht — und
// still, weil jQuery auf eine leere Auswahl klaglos nichts bindet.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(join(root, "scripts/custom-sheet.js"), "utf8");
const html = readFileSync(join(root, "templates/sheet.html"), "utf8");

const HANDLER_PREFIXES = ["add-", "delete-", "roll-", "area-", "pick-"];
const HANDLER_EXACT = ["typepick", "profile-img"];

const classesInTemplate = new Set();
for (const match of html.matchAll(/class="([^"]+)"/g)) {
  for (const cls of match[1].split(/\s+/)) classesInTemplate.add(cls);
}

const selectors = [...new Set(
  [...js.matchAll(/html\.find\('\.([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1])
)].sort();

let fails = 0;

for (const selector of selectors) {
  if (classesInTemplate.has(selector)) {
    console.log(`ok   Listener .${selector} findet das Element`);
  } else {
    fails += 1;
    console.log(`FAIL Listener .${selector} hat keine Entsprechung im Template`);
  }
}

const handlerClasses = [...classesInTemplate].filter(cls =>
  HANDLER_EXACT.includes(cls) || HANDLER_PREFIXES.some(prefix => cls.startsWith(prefix))
).sort();

for (const cls of handlerClasses) {
  if (js.includes(`html.find('.${cls}')`)) {
    console.log(`ok   Element .${cls} hat einen Listener`);
  } else {
    fails += 1;
    console.log(`FAIL Element .${cls} hat keinen Listener`);
  }
}

// Die Datenattribute des Typ-Auswahlfensters müssen vollständig sein.
for (const match of html.matchAll(/<span class="typepick"([^>]*)>/g)) {
  const attrs = match[1];
  for (const needed of ["data-field", "data-index", "data-key"]) {
    if (attrs.includes(needed)) continue;
    fails += 1;
    console.log(`FAIL typepick ohne ${needed}: ${attrs.trim().slice(0, 60)}`);
  }
}
console.log("ok   alle typepick tragen data-field, data-index und data-key");

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
