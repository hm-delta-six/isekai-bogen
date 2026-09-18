#!/usr/bin/env node
// Packt das Modul als ZIP und schiebt es über die Forge-Import-API in die Foundry-Data.
// Das ist derselbe Weg, den der Import-Assistent auf https://eu.forge-vtt.com/setup benutzt.
//
// Voraussetzung: API-Key mit den Rechten read-data und write-data,
// zu erstellen unter https://forge-vtt.com/user/profile (API Keys).
//
// Aufruf (Key NIE ins Repo oder in die Kommandozeile schreiben, nur als Umgebungsvariable):
//   $env:FORGE_API_KEY = "..."      # PowerShell
//   node tools/deploy-forge.mjs
//
// Optionen:
//   --dry-run     nur das ZIP bauen, nichts hochladen
//   --type world  statt module importieren (Standard: module)

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, mkdtempSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://forge-vtt.com/api/data/import";
const CONTENTS = ["module.json", "scripts", "templates"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const typeIndex = args.indexOf("--type");
const importType = typeIndex === -1 ? "module" : args[typeIndex + 1];

const manifest = JSON.parse(readFileSync(join(ROOT, "module.json"), "utf8"));
const { id, version } = manifest;

const apiKey = process.env.FORGE_API_KEY;
if (!dryRun && !apiKey) {
  console.error("FORGE_API_KEY ist nicht gesetzt. Key unter https://forge-vtt.com/user/profile anlegen.");
  process.exit(1);
}

// ZIP mit dem Modulordner als oberster Ebene bauen (isekai-bogen/module.json, ...).
const staging = mkdtempSync(join(tmpdir(), "isekai-deploy-"));
const zipPath = join(staging, `${id}-${version}.zip`);
let keepStaging = false;

try {
  const moduleDir = join(staging, id);
  for (const entry of CONTENTS) {
    const source = join(ROOT, entry);
    if (!existsSync(source)) {
      console.error(`Fehlt im Projekt: ${entry}`);
      process.exit(1);
    }
    cpSync(source, join(moduleDir, entry), { recursive: true });
  }

  execFileSync("powershell", [
    "-NoProfile", "-Command",
    `Compress-Archive -Path '${moduleDir}' -DestinationPath '${zipPath}' -Force`
  ], { stdio: "inherit" });

  const zip = readFileSync(zipPath);
  console.log(`ZIP gebaut: ${id} v${version} (${(zip.length / 1024).toFixed(1)} KB)`);

  if (dryRun) {
    // Absichtlich ohne Aufräumen, damit das ZIP zum Reinschauen liegen bleibt.
    console.log(`Dry-Run, nichts hochgeladen. Datei: ${zipPath}`);
    keepStaging = true;
    process.exit(0);
  }

  const form = new FormData();
  form.append("type", importType);
  form.append("zip", new Blob([zip], { type: "application/zip" }), `${id}.zip`);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Access-Key": apiKey },
    body: form
  });

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  console.log(text);

  if (!response.ok) process.exit(1);
} finally {
  if (!keepStaging) rmSync(staging, { recursive: true, force: true });
}
