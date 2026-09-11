import { I18n } from '@affine/i18n';
import { type PointerEvent, useCallback, useRef, useState } from 'react';

import { createElement } from './scene';
import { sceneToSvg } from './svg';
import type { SketchElement, SketchScene } from './types';

export type SketchTool =
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'freedraw';

export type SketchFallbackProps = {
  scene: SketchScene;
  editing: boolean;
  onPointerUpdate?: (pointer: { x: number; y: number }) => void;
  onChange: (scene: SketchScene) => void;
};

const toolLabel: Record<SketchTool, () => string> = {
  rectangle: () => I18n['com.affine.whiteboard.sketch.tool.rectangle'](),
  ellipse: () => I18n['com.affine.whiteboard.sketch.tool.ellipse'](),
  arrow: () => I18n['com.affine.whiteboard.sketch.tool.arrow'](),
  text: () => I18n['com.affine.whiteboard.sketch.tool.text'](),
  freedraw: () => I18n['com.affine.whiteboard.sketch.tool.freedraw'](),
};

export function SketchFallback({
  scene,
  editing,
  onChange,
  onPointerUpdate,
}: SketchFallbackProps) {
  const [tool, setTool] = useState<SketchTool>('rectangle');
  const drag = useRef<{
    x: number;
    y: number;
    points?: number[][];
  } | null>(null);

  const start = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!editing) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      drag.current = {
        x,
        y,
        points: tool === 'freedraw' ? [[0, 0]] : undefined,
      };
    },
    [editing, tool]
  );

  const move = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!editing || !drag.current || tool !== 'freedraw') return;
      const rect = event.currentTarget.getBoundingClientRect();
      drag.current.points?.push([
        event.clientX - rect.left - drag.current.x,
        event.clientY - rect.top - drag.current.y,
      ]);
    },
    [editing, tool]
  );

  const end = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!editing || !drag.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x2 = event.clientX - rect.left;
      const y2 = event.clientY - rect.top;
      const box = {
        x: Math.min(drag.current.x, x2),
        y: Math.min(drag.current.y, y2),
        width: Math.abs(x2 - drag.current.x),
        height: Math.abs(y2 - drag.current.y),
      };
      const extra: Partial<SketchElement> =
        tool === 'text'
          ? {
              text: 'Text',
              fontSize: 18,
              width: Math.max(box.width, 80),
              height: 24,
            }
          : tool === 'freedraw'
            ? {
                points: drag.current.points,
                width: box.width,
                height: box.height,
              }
            : {};
      const next = createElement(tool, box, extra);
      drag.current = null;
      onChange({ ...scene, elements: [...scene.elements, next] });
    },
    [editing, onChange, scene, tool]
  );

  return (
    <div className="wb-sketch__fallback">
      {editing ? (
        <div className="wb-sketch__tools">
          {(['rectangle', 'ellipse', 'arrow', 'text', 'freedraw'] as const).map(
            item => (
              <button
                key={item}
                type="button"
                className={item === tool ? 'is-active' : ''}
                onClick={() => setTool(item)}
              >
                {toolLabel[item]()}
              </button>
            )
          )}
        </div>
      ) : null}
      <div
        className="wb-sketch__canvas"
        onPointerDown={start}
        onPointerMove={event => {
          move(event);
          if (editing) {
            const rect = event.currentTarget.getBoundingClientRect();
            onPointerUpdate?.({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }
        }}
        onPointerUp={end}
        dangerouslySetInnerHTML={{ __html: sceneToSvg(scene) }}
      />
    </div>
  );
}
