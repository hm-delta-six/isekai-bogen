/**
 * Platzieren einer Kegel- oder Kreisvorlage auf der Karte.
 *
 * Foundry bietet dafür keine fertige Funktion an. Der Ablauf ist derselbe wie
 * im dnd5e-System: eine Vorschau auf die Vorlagenebene legen, der Maus folgen,
 * mit Mausrad drehen, per Klick bestätigen und per Rechtsklick abbrechen.
 */
export async function placeTemplate({ shape = "cone", distance = 6, angle = 53, actor = null }) {
  const data = {
    t: shape,
    user: game.user.id,
    distance,
    direction: 0,
    x: 0,
    y: 0,
    fillColor: game.user.color,
    flags: { "isekai-bogen": { actorUuid: actor?.uuid ?? null } }
  };
  if (shape === "cone") data.angle = angle;

  const cls = CONFIG.MeasuredTemplate.documentClass;
  const document = new cls(data, { parent: canvas.scene });
  const preview = new CONFIG.MeasuredTemplate.objectClass(document);

  const layer = canvas.templates;
  await preview.draw();
  preview.layer.preview.addChild(preview);

  const initialLayer = canvas.activeLayer;
  layer.activate();
  ui.notifications.info("Fläche platzieren: Klick setzt, Mausrad dreht, Rechtsklick bricht ab.");

  return new Promise(resolve => {
    let moveTime = 0;

    const finish = (result) => {
      preview.destroy();
      layer.preview.removeChildren();
      canvas.stage.off("mousemove", onMove);
      canvas.stage.off("mousedown", onConfirm);
      canvas.app.view.oncontextmenu = null;
      canvas.app.view.onwheel = null;
      initialLayer.activate();
      resolve(result);
    };

    const onMove = (event) => {
      event.stopPropagation();
      const now = Date.now();
      if (now - moveTime <= 20) return;
      moveTime = now;

      const center = event.data.getLocalPosition(layer);
      const snapped = canvas.grid.getSnappedPosition(center.x, center.y, 2);
      preview.document.updateSource({ x: snapped.x, y: snapped.y });
      preview.refresh();
    };

    const onWheel = (event) => {
      if (!event.shiftKey && !event.ctrlKey) return;
      event.stopPropagation();
      const delta = event.deltaY < 0 ? 1 : -1;
      const step = event.shiftKey ? 15 : 5;
      preview.document.updateSource({ direction: preview.document.direction + delta * step });
      preview.refresh();
    };

    const onConfirm = (event) => {
      event.stopPropagation();
      const { x, y, direction } = preview.document;
      finish({ ...data, x, y, direction });
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

/**
 * Tokens, deren Mittelpunkt in der Vorlage liegt.
 * Die Form wird relativ zum Ursprung der Vorlage geprüft, deshalb der Versatz.
 */
export function tokensInTemplate(templateData) {
  const cls = CONFIG.MeasuredTemplate.documentClass;
  const document = new cls(templateData, { parent: canvas.scene });
  const object = new CONFIG.MeasuredTemplate.objectClass(document);
  object._applyRenderFlags = () => {};
  object.document.updateSource({ x: templateData.x, y: templateData.y });

  const shape = object._computeShape ? object._computeShape() : object.shape;
  if (!shape) return [];

  return canvas.tokens.placeables.filter(token => {
    const center = token.center;
    return shape.contains(center.x - templateData.x, center.y - templateData.y);
  });
}
