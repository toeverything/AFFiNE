declare module '@excalidraw/excalidraw' {
  import type { ComponentType } from 'react';

  export const Excalidraw: ComponentType<Record<string, unknown>>;
  export function exportToSvg(opts: {
    elements: unknown[];
    appState?: unknown;
    files?: unknown;
  }): Promise<SVGSVGElement>;
  export function exportToBlob(opts: {
    elements: unknown[];
    mimeType?: string;
    appState?: unknown;
    files?: unknown;
  }): Promise<Blob>;
}
