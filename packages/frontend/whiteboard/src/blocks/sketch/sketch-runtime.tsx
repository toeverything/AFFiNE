import { createElement, useEffect, useRef, useState } from 'react';

import type { SketchRemoteCursor } from './cursors';
import { SketchFallback } from './sketch-fallback';
import type { SketchScene } from './types';

export type SketchRuntimeProps = {
  scene: SketchScene;
  editing: boolean;
  sceneEpoch?: number;
  collaborators?: SketchRemoteCursor[];
  onPointerUpdate?: (pointer: { x: number; y: number }) => void;
  onChange: (scene: SketchScene) => void;
};

type ExcalidrawModule = typeof import('@excalidraw/excalidraw');

export async function loadExcalidraw(): Promise<ExcalidrawModule | null> {
  try {
    return await import('@excalidraw/excalidraw');
  } catch {
    return null;
  }
}

export function SketchRuntime(props: SketchRuntimeProps) {
  const [excalidraw, setExcalidraw] = useState<ExcalidrawModule | null | undefined>();

  useEffect(() => {
    void loadExcalidraw().then(setExcalidraw);
  }, []);

  if (excalidraw === undefined) {
    return null;
  }
  if (!excalidraw) {
    return createElement(SketchFallback, props);
  }

  const Excalidraw = excalidraw.Excalidraw;
  return createElement(ExcalidrawBridge, { ...props, Excalidraw });
}

function ExcalidrawBridge(
  props: SketchRuntimeProps & { Excalidraw: ExcalidrawModule['Excalidraw'] }
) {
  const api = useRef<{
    updateScene?: (next: {
      elements?: unknown;
      collaborators?: Map<string, unknown>;
    }) => void;
  } | null>(null);

  useEffect(() => {
    api.current?.updateScene?.({
      elements: props.scene.elements,
      collaborators: toCollaborators(props.collaborators),
    });
  }, [props.sceneEpoch, props.scene, props.collaborators]);

  return createElement(props.Excalidraw, {
    initialData: {
      elements: props.scene.elements,
      appState: {
        ...props.scene.appState,
        viewModeEnabled: !props.editing,
      },
      files: props.scene.files,
    },
    viewModeEnabled: !props.editing,
    zenModeEnabled: false,
    gridModeEnabled: false,
    UIOptions: {
      canvasActions: {
        loadScene: false,
        saveToActiveFile: false,
      },
    },
    collaborators: toCollaborators(props.collaborators),
    excalidrawAPI: (next: unknown) => {
      api.current = next as typeof api.current;
    },
    onPointerUpdate: (payload: { pointer?: { x: number; y: number } }) => {
      if (payload.pointer) props.onPointerUpdate?.(payload.pointer);
    },
    onChange: (elements: unknown, appState: { viewBackgroundColor?: string }) => {
      props.onChange({
        ...props.scene,
        elements: (elements as SketchScene['elements']) ?? props.scene.elements,
        appState: {
          viewBackgroundColor:
            appState.viewBackgroundColor ??
            props.scene.appState.viewBackgroundColor,
        },
      });
    },
  });
}

function toCollaborators(cursors: SketchRemoteCursor[] = []) {
  return new Map(
    cursors.map(cursor => [
      String(cursor.clientId),
      {
        username: cursor.name,
        color: cursor.color,
        button: cursor.button ?? 'up',
        pointer: { x: cursor.x, y: cursor.y, tool: 'pointer' },
      },
    ])
  );
}
