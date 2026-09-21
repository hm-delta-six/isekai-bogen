/**
 * Platzieren einer Kegel-, Kreis- oder Linienvorlage auf der Karte.
 *
 * Foundry bietet dafür keine fertige Funktion an. Der Ablauf folgt dem
 * dnd5e-System: Vorschau auf die Vorlagenebene legen, der Maus folgen, mit
 * Shift/Strg + Mausrad drehen, per Klick bestätigen, per Rechtsklick abbrechen.
 *
 * Zurück kommt nur { x, y, direction } — welche Tokens getroffen sind, rechnet
 * area.js aus, damit das nicht von Foundry-Interna abhängt.
 */
export async function placeTemplate({ t, distance, angle = 53, width = null }) {
  const data = {
    t,
    user: game.user.id,
    distance,
    direction: 0,
    x: 0,
    y: 0,
    fillColor: game.user.color
  };
  if (t === "cone") data.angle = angle;
  if (t === "ray" && width) data.width = width;

  const cls = CONFIG.MeasuredTemplate.documentClass;
  const document = new cls(data, { parent: canvas.scene });
  const preview = new CONFIG.MeasuredTemplate.objectClass(document);

  const layer = canvas.templates;
  await preview.draw();
  layer.preview.addChild(preview);

  const initialLayer = canvas.activeLayer;
  layer.activate();
  ui.notifications.info("Fläche platzieren: Klick setzt, Shift/Strg + Mausrad dreht, Rechtsklick bricht ab.");

  const redraw = () => {
    if (typeof preview.refresh === "function") preview.refresh();
    else preview.renderFlags?.set({ refresh: true });
  };

  const snap = (point) => {
    try {
      if (canvas.grid.getSnappedPoint) {
        const modes = CONST.GRID_SNAPPING_MODES;
        return canvas.grid.getSnappedPoint(point, { mode: modes.CENTER | modes.VERTEX, resolution: 1 });
      }
      return canvas.grid.getSnappedPosition(point.x, point.y, 2);
    } catch {
      return point;
    }
  };

  return new Promise(resolve => {
    let moveTime = 0;

    const finish = (result) => {
      canvas.stage.off("mousemove", onMove);
      canvas.stage.off("mousedown", onConfirm);
      canvas.app.view.oncontextmenu = null;
      canvas.app.view.onwheel = null;
      layer.preview.removeChildren();
      preview.destroy();
      initialLayer.activate();
      resolve(result);
    };

    const onMove = (event) => {
      event.stopPropagation();
      const now = Date.now();
      if (now - moveTime <= 20) return;
      moveTime = now;

      const point = snap(event.data.getLocalPosition(layer));
      preview.document.updateSource({ x: point.x, y: point.y });
      redraw();
    };

    const onWheel = (event) => {
      if (!event.shiftKey && !event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY < 0 ? 1 : -1;
      const step = event.shiftKey ? 15 : 5;
      preview.document.updateSource({ direction: preview.document.direction + delta * step });
      redraw();
    };

    const onConfirm = (event) => {
      if (event.data?.button !== undefined && event.data.button !== 0) return;
      event.stopPropagation();
      const { x, y, direction } = preview.document;
      finish({ x, y, direction });
    };

    const onCancel = (event) => {
      event.preventDefault();
      finish(null);
    };

    canvas.stage.on("mousemove", onMove);
    canvas.stage.on("mousedown", onConfirm);
    canvas.app.view.oncontextmenu = onCancel;
    canvas.app.view.onwheel = onWheel;
  });
}
