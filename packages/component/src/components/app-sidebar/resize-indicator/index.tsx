import type { Instance } from '@popperjs/core';
import { createPopper } from '@popperjs/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { ReactElement, RefObject } from 'react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';

import { appSidebarOpenAtom, appSidebarWidthAtom } from '../index.jotai';
import { spacerStyle } from './index.css';

export type ResizeIndicatorProps = {
  targetElement: RefObject<HTMLElement>;
};

export const ResizeIndicator = (props: ResizeIndicatorProps): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);
  const popperRef = useRef<Instance | null>(null);
  const setWidth = useSetAtom(appSidebarWidthAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(appSidebarOpenAtom);
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    if (ref.current) {
      if (props.targetElement.current) {
        popperRef.current = createPopper(
          props.targetElement.current,
          ref.current,
          {
            placement: 'right',
          }
        );
      }
    }
  }, [props.targetElement]);

  const sidebarWidth = useDeferredValue(useAtomValue(appSidebarWidthAtom));
  useEffect(() => {
    if (popperRef.current) {
      popperRef.current.update();
    }
  }, [sidebarWidth]);

  const onResizeStart = useCallback(() => {
    let resized = false;

    function onMouseMove(e: MouseEvent) {
      e.preventDefault();
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
        if (popperRef.current) {
          popperRef.current.update();
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
      data-testid="app-sidebar-resizer"
      data-resizing={isResizing}
      data-open={sidebarOpen}
      onMouseDown={onResizeStart}
    />
  );
};
