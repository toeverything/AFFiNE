import type { exportToSvg } from '@excalidraw/excalidraw';

import { sceneToSvg } from './svg';
import type { SketchScene } from './types';

type SketchExporter = { exportToSvg: typeof exportToSvg };

let exporter: Promise<SketchExporter | null> | undefined;

function loadExporter() {
  exporter ??= import('@excalidraw/excalidraw').then(
    module => module,
    () => null
  );
  return exporter;
}

/**
 * Excalidraw's own renderer, so exports carry freedraw smoothing, fonts and
 * arrow bindings. `sceneToSvg` stays as the offline fallback: the same module
 * is missing when `SketchFallback` is the editor (§6.4).
 */
export async function sceneToExportedSvg(scene: SketchScene): Promise<string> {
  const module = await loadExporter();
  if (!module) return sceneToSvg(scene);
  try {
    const svg = await module.exportToSvg({
      elements: scene.elements,
      appState: { ...scene.appState, exportBackground: true },
      files: scene.files,
    });
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return sceneToSvg(scene);
  }
}
