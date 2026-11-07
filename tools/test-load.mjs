// Laedt jede Datei aus scripts/ mit einer minimalen Foundry-Attrappe.
//
// Grund: ein Syntaxfehler oder ein Fehler beim Import bricht das ganze Modul
// ab, bevor der init-Hook laeuft — dann ist der Charakterbogen in Foundry
// nicht mehr auswaehlbar, ohne dass irgendwo ein Hinweis darauf steht.
// Genau das ist in 2.11.0 passiert (doppeltes const owned).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");

globalThis.Application = class { static get defaultOptions() { return {}; } };
globalThis.ActorSheet = class extends globalThis.Application {};
globalThis.Actors = { registerSheet: () => {} };
globalThis.Dialog = class { static confirm() {} };
globalThis.Hooks = { once: (hook, fn) => { if (hook === "init") fn(); }, on: () => {} };
globalThis.mergeObject = (a, b) => ({ ...a, ...b });
globalThis.foundry = {
  utils: {
    mergeObject: globalThis.mergeObject,
    duplicate: value => JSON.parse(JSON.stringify(value)),
    getRoute: path => path
  }
};
globalThis.game = {
  settings: { register: () => {}, get: () => [] },
  user: { isGM: true },
  i18n: { localize: key => key }
};
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} }, windows: {} };
globalThis.CONFIG = { Actor: {} };
globalThis.TokenDocument = class {};
globalThis.canvas = {};
globalThis.Roll = class {};
globalThis.ChatMessage = { create: () => {} };
globalThis.fromUuid = async () => null;

let fails = 0;
for (const name of readdirSync(join(root, "scripts")).filter(file => file.endsWith(".js")).sort()) {
  try {
    await import(pathToFileURL(join(root, "scripts", name)).href);
    console.log(`ok   ${name} laedt`);
  } catch (error) {
    fails += 1;
    console.log(`FAIL ${name} laedt nicht\n  ${error.message}`);
  }
}

// Die Testdateien selbst auf Syntax pruefen. Ein Fehler darin faellt sonst
// erst auf, wenn man genau diese Suite startet.
for (const name of readdirSync(join(root, "tools")).filter(file => file.endsWith(".mjs")).sort()) {
  try {
    execFileSync(process.execPath, ["--check", join(root, "tools", name)], { stdio: "pipe" });
    console.log(`ok   ${name} ist syntaktisch in Ordnung`);
  } catch (error) {
    fails += 1;
    const meldung = String(error.stderr || error.message)
      .split(String.fromCharCode(10)).find(line => line.includes("Error")) || "";
    console.log(`FAIL ${name} hat einen Syntaxfehler: ${meldung || error.message}`);
  }
}

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nalle Tests bestanden");
process.exit(fails ? 1 : 0);
