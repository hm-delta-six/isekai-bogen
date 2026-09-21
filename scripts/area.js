/**
 * Geometrie der Flächenangriffe, unabhängig von Foundry.
 *
 * Eine Vorlage wird in Pixeln beschrieben:
 *   { t: "circle" | "cone" | "ray", x, y, direction, distance, angle, width }
 * direction in Grad, 0 = nach rechts, im Uhrzeigersinn (Canvas-y zeigt nach
 * unten) — dieselbe Konvention wie Foundrys MeasuredTemplate.
 * distance ist beim Kreis der Radius, bei Kegel und Linie die Länge.
 */

const toRadians = (degrees) => degrees * Math.PI / 180;

export function templateContains(template, px, py) {
  const dx = px - template.x;
  const dy = py - template.y;
  const reach = template.distance;

  switch (template.t) {
    case "circle":
      return dx * dx + dy * dy <= reach * reach;

    case "cone": {
      if (dx * dx + dy * dy > reach * reach) return false;
      if (dx === 0 && dy === 0) return true;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const offset = ((angle - template.direction) % 360 + 540) % 360 - 180;
      return Math.abs(offset) <= template.angle / 2;
    }

    case "ray": {
      const rad = toRadians(template.direction);
      const along = dx * Math.cos(rad) + dy * Math.sin(rad);
      const across = -dx * Math.sin(rad) + dy * Math.cos(rad);
      return along >= 0 && along <= reach && Math.abs(across) <= template.width / 2;
    }

    default:
      return false;
  }
}

/**
 * Anteil eines Token-Rechtecks, der in der Vorlage liegt, von 0 bis 1.
 * Gemessen über ein gleichmäßiges Punktraster — bei 10×10 Punkten ist ein
 * Token pro Kästchen auf 1 % genau, das reicht für die Hälfte-Grenze.
 */
export function templateCoverage(template, rect, samples = 10) {
  let inside = 0;
  for (let i = 0; i < samples; i += 1) {
    for (let j = 0; j < samples; j += 1) {
      const px = rect.x + (i + 0.5) * rect.w / samples;
      const py = rect.y + (j + 0.5) * rect.h / samples;
      if (templateContains(template, px, py)) inside += 1;
    }
  }
  return inside / (samples * samples);
}

// Mindestens zur Hälfte in der Fläche gilt als getroffen.
export const HIT_COVERAGE = 0.5;

/**
 * Wandelt die Bereichsangabe einer Waffe (in Kästchen) in Foundry-Einheiten
 * für die Vorschau und in Pixel für die Trefferprüfung um.
 * unitsPerSquare: canvas.dimensions.distance (z.B. 5 Fuß oder 1,5 m)
 * pixelsPerSquare: canvas.dimensions.size
 */
export function templateShape(mode, squares, unitsPerSquare, pixelsPerSquare) {
  switch (mode) {
    case "cone":
      return { t: "cone", squares, angle: 53, width: null,
        units: squares * unitsPerSquare, pixels: squares * pixelsPerSquare };
    case "circle": {
      const radius = squares / 2;
      return { t: "circle", squares: radius, angle: null, width: null,
        units: radius * unitsPerSquare, pixels: radius * pixelsPerSquare };
    }
    case "line":
      return { t: "ray", squares, angle: null,
        width: { units: unitsPerSquare, pixels: pixelsPerSquare },
        units: squares * unitsPerSquare, pixels: squares * pixelsPerSquare };
    default:
      return null;
  }
}
