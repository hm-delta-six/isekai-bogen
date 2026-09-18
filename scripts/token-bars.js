// HP, MP und AP gehören nicht zum pf1-Datenmodell. Ohne Nachhilfe tauchen sie
// deshalb in keiner Balkenauswahl auf — weder in der Token-Konfiguration eines
// Akteurs noch in der Standard-Token-Konfiguration.
const BAR_PATHS = [
  ["resources", "hp"],
  ["resources", "mp"],
  ["resources", "ap"]
];

function appendBars(result) {
  if (!Array.isArray(result?.bar)) return result;
  for (const path of BAR_PATHS) {
    const dotted = path.join(".");
    if (!result.bar.some(existing => existing.join(".") === dotted)) {
      result.bar.push([...path]);
    }
  }
  return result;
}

export function registerTokenBars() {
  // 1) Pflegt das System eine eigene Liste, wird sie dort ergänzt.
  const tracked = CONFIG.Actor?.trackableAttributes;
  if (tracked) {
    for (const config of Object.values(tracked)) {
      config.bar ??= [];
      for (const path of BAR_PATHS) {
        const dotted = path.join(".");
        if (!config.bar.includes(dotted)) config.bar.push(dotted);
      }
    }
  }

  // 2) Die Standard-Token-Konfiguration kennt keinen Akteur und baut die Liste
  //    aus dem Systemdatenmodell, in dem unsere Felder fehlen. Deshalb wird die
  //    Ermittlung selbst erweitert. Der Pfad-Parameter markiert die Rekursion in
  //    tiefere Ebenen — dort darf nichts angehängt werden.
  const classes = new Set([TokenDocument, CONFIG.Token?.documentClass].filter(Boolean));
  for (const cls of classes) {
    const original = cls.getTrackedAttributes;
    if (typeof original !== "function" || original.isekaiPatched) continue;

    const patched = function (data, path = []) {
      const result = original.call(this, data, path);
      return path.length ? result : appendBars(result);
    };
    patched.isekaiPatched = true;
    cls.getTrackedAttributes = patched;
  }
}
