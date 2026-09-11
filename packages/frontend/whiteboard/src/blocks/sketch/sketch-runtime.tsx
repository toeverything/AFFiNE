import type * as Excalidraw from '@excalidraw/excalidraw';
import {
  type ComponentProps,
  createElement,
  useEffect,
  useRef,
  useState,
} from 'react';

import { detach } from '../../detach';
import type { SketchPointerButton, SketchRemoteCursor } from './cursors';
import { SketchFallback } from './sketch-fallback';
import type { SketchScene } from './types';

export type SketchRuntimeProps = {
  scene: SketchScene;
  editing: boolean;
  sceneEpoch?: number;
  collaborators?: SketchRemoteCursor[];
  onPointerUpdate?: (pointer: {
    x: number;
    y: number;
    button?: SketchPointerButton;
  }) => void;
  onChange: (scene: SketchScene) => void;
};

type ExcalidrawModule = typeof Excalidraw;
type ExcalidrawProps = ComponentProps<ExcalidrawModule['Excalidraw']>;

/**
 * Scenes round-trip through Yjs, so `SketchScene` types only the fields the
 * whiteboard itself reads; Excalidraw owns the full element schema and carries
 * the remaining fields through untouched.
 */
function toInitialData(
  scene: SketchScene,
  editing: boolean
): ExcalidrawProps['initialData'] {
  return {
    elements: scene.elements,
    appState: { ...scene.appState, viewModeEnabled: !editing },
    files: scene.files,
  } as unknown as ExcalidrawProps['initialData'];
}

export async function loadExcalidraw(): Promise<ExcalidrawModule | null> {
  try {
    return await import('@excalidraw/excalidraw');
  } catch {
    return null;
  }
}

export function SketchRuntime(props: SketchRuntimeProps) {
  const [excalidraw, setExcalidraw] = useState<
    ExcalidrawModule | null | undefined
  >();

  useEffect(() => {
    detach(loadExcalidraw().then(setExcalidraw));
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
    initialData: toInitialData(props.scene, props.editing),
    viewModeEnabled: !props.editing,
    zenModeEnabled: false,
    gridModeEnabled: false,
    UIOptions: {
      canvasActions: {
        loadScene: false,
        saveToActiveFile: false,
      },
    },
    excalidrawAPI: (next: unknown) => {
      api.current = next as typeof api.current;
    },
    onPointerUpdate: (payload: {
      pointer?: { x: number; y: number };
      button?: SketchPointerButton;
    }) => {
      if (payload.pointer) {
        props.onPointerUpdate?.({ ...payload.pointer, button: payload.button });
      }
    },
    onChange: (
      elements: unknown,
      appState: { viewBackgroundColor?: string }
    ) => {
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

/**
 * Peer cursors reach Excalidraw through `updateScene`, not a prop; the map is
 * keyed by its branded `SocketId` and `color` is a background/stroke pair.
 */
function toCollaborators(cursors: SketchRemoteCursor[] = []) {
  return new Map<string, unknown>(
    cursors.map(cursor => [
      String(cursor.clientId),
      {
        username: cursor.name,
        color: { background: cursor.color, stroke: cursor.color },
        button: cursor.button ?? 'up',
        pointer: { x: cursor.x, y: cursor.y, tool: 'pointer' },
      },
    ])
  );
}
