import { useAtom, useSetAtom } from 'jotai';
import type { ReactElement, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { appSidebarOpenAtom, appSidebarWidthAtom } from '../index.jotai';
import { spacerStyle } from './index.css';

export type ResizeIndicatorProps = {
  targetElement: RefObject<HTMLElement>;
};

export const ResizeIndicator = (props: ResizeIndicatorProps): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);
  const setWidth = useSetAtom(appSidebarWidthAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(appSidebarOpenAtom);
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    if (ref.current) {
      if (props.targetElement.current) {
        const rect = props.targetElement.current.getBoundingClientRect();
        ref.current.style.top = `${rect.top}px`;
        ref.current.style.left = `${rect.right}px`;

        const observer = new ResizeObserver(entries => {
          const rect = entries[0].target.getBoundingClientRect();
          if (ref.current) {
            ref.current.style.top = `${rect.top}px`;
            ref.current.style.left = `${rect.right}px`;
          }
        });

        observer.observe(props.targetElement.current);

        return () => {
          observer.disconnect();
        };
      }
    }
  }, [props.targetElement]);

  const onResizeStart = useCallback(() => {
    let resized = false;

    function onMouseMove(e: MouseEvent) {
      const newWidth = Math.min(480, Math.max(e.clientX, 256));
      setWidth(newWidth);
      setIsResizing(true);
      resized = true;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener(
      'mouseup',
      () => {
        // if not resized, toggle sidebar
        if (!resized) {
          setSidebarOpen(o => !o);
        }
        setIsResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
      },
      { once: true }
    );
  }, [setSidebarOpen, setWidth]);

  return (
    <div
      ref={ref}
      className={spacerStyle}
      data-resizing={isResizing}
      data-open={sidebarOpen}
      onMouseDown={onResizeStart}
    />
  );
};
