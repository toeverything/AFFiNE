import type { HTMLAttributes } from 'react';
import { useCallback } from 'react';

import * as styles from './split-view.css';

interface ResizeHandleProps extends HTMLAttributes<HTMLDivElement> {
  resizing: boolean;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  onResizing: (offset: { x: number; y: number }) => void;
}
export const ResizeHandle = ({
  resizing,
  onResizing,
  onResizeStart,
  onResizeEnd,
}: ResizeHandleProps) => {
  // TODO(@catsjuice): touch support
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      onResizeStart();
      const prevPos = { x: e.clientX, y: e.clientY };

      function onMouseMove(e: MouseEvent) {
        e.preventDefault();
        const dx = e.clientX - prevPos.x;
        const dy = e.clientY - prevPos.y;
        onResizing({ x: dx, y: dy });
        prevPos.x = e.clientX;
        prevPos.y = e.clientY;
      }

      function onMouseUp(e: MouseEvent) {
        e.preventDefault();
        onResizeEnd();
        document.removeEventListener('mousemove', onMouseMove);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp, { once: true });
    },
    [onResizeEnd, onResizeStart, onResizing]
  );

  return (
    <div
      onMouseDown={onMouseDown}
      data-resizing={resizing || null}
      className={styles.resizeHandle}
    />
  );
};
