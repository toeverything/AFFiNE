import clsx from 'clsx';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';

import * as styles from './styles.css';

export interface ResizePanelProps
  extends PropsWithChildren,
    HTMLAttributes<HTMLDivElement> {
  horizontal?: boolean;
  vertical?: boolean;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * This component is used for debugging responsive layout in storybook
 * @internal
 */
export const ResizePanel = ({
  width,
  height,
  children,
  minHeight,
  minWidth,
  maxHeight,
  maxWidth,
  className,
  horizontal = true,
  vertical = true,

  ...attrs
}: ResizePanelProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cornerHandleRef = useRef<HTMLDivElement | null>(null);
  const displayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !cornerHandleRef.current) return;

    const containerEl = containerRef.current;
    const cornerHandleEl = cornerHandleRef.current;

    let startPos: [number, number] = [0, 0];
    let startSize: [number, number] = [0, 0];

    const onDragStart = (e: MouseEvent) => {
      containerEl.dataset.resizing = 'true';
      startPos = [e.clientX, e.clientY];
      startSize = [containerEl.offsetWidth, containerEl.offsetHeight];
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onDragEnd);
    };

    const onDrag = (e: MouseEvent) => {
      const pos = [e.clientX, e.clientY];
      const delta = [pos[0] - startPos[0], pos[1] - startPos[1]];
      const newSize = [startSize[0] + delta[0], startSize[1] + delta[1]];
      updateSize(newSize);
    };

    const onDragEnd = () => {
      containerEl.dataset.resizing = 'false';
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onDragEnd);
    };

    const updateSize = (size: number[]) => {
      if (!containerEl) return;

      if (horizontal) {
        const width = Math.max(
          Math.min(size[0], maxWidth ?? Infinity),
          minWidth ?? 0
        );
        containerEl.style.width = `${width}px`;
      }

      if (vertical) {
        const height = Math.max(
          Math.min(size[1], maxHeight ?? Infinity),
          minHeight ?? 0
        );
        containerEl.style.height = `${height}px`;
      }

      if (displayRef.current) {
        displayRef.current.textContent = `${containerEl.offsetWidth}px * ${containerEl.offsetHeight}px`;
      }
    };

    updateSize([width ?? 400, height ?? 200]);
    cornerHandleEl.addEventListener('mousedown', onDragStart);

    return () => {
      cornerHandleEl.removeEventListener('mousedown', onDragStart);
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onDragEnd);
    };
  }, [
    height,
    horizontal,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    vertical,
    width,
  ]);

  return (
    <div
      ref={containerRef}
      className={clsx(styles.container, className)}
      {...attrs}
    >
      {children}
      <div ref={cornerHandleRef} className={styles.cornerHandle}>
        <div ref={displayRef} className={styles.display}></div>
      </div>
    </div>
  );
};
