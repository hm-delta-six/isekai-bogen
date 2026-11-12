// Baut die Variante des Skill-Baums: Grundbestand plus die Technik-Skills aus
// docs/vorschlag-moderne-skills.json.
//
//   node tools/build-modern-tree.mjs
//
// Die Zauber stehen nicht hier: sie sind genre-unabhaengig und liegen im
// Grundbestand, also auch in dieser Variante. Geprueft wird in
// tools/merge-skills.mjs, das hier nur aufgerufen wird.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
execFileSync(process.execPath, [
  join(root, "tools/merge-skills.mjs"),
  "data/skill-baum.json",
  "docs/vorschlag-moderne-skills.json",
  "data/skill-baum-modern.json"
], { stdio: "inherit" });
