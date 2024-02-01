import clsx from 'clsx';
import {
  type DragEvent,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { SplitViewContext } from './split-view.context';
import * as styles from './split-view.css';
import type { SplitViewTriggerProps } from './types';

const dragImage = new Image();
dragImage.src =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export const SplitViewTrigger = ({
  className,
  children,
  previewRenderer,
  contentRenderer,
}: SplitViewTriggerProps) => {
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [isCurrent, setIsCurrent] = useState(false);

  const { dragging, readyToDrop, setDragging, setNodeToAppend } =
    useContext(SplitViewContext);

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      // if custom preview renderer is provided, hide the default drag image
      if (previewRenderer) {
        e.dataTransfer?.setDragImage(dragImage, 0, 0);
      }

      // set flag
      setIsCurrent(true);
      setDragging?.(true);

      // set active node
      contentRenderer && setNodeToAppend?.(contentRenderer?.());
    },
    [contentRenderer, previewRenderer, setDragging, setNodeToAppend]
  );

  const onDragEnd = useCallback(() => {
    setIsCurrent(false);
    setDragging?.(false);
    setNodeToAppend?.(null);
  }, [setDragging, setNodeToAppend]);

  const onDrag = useCallback((e: DragEvent<HTMLDivElement>) => {
    setPos({ left: e.clientX, top: e.clientY });
  }, []);

  const Preview = useMemo(() => {
    if (!isCurrent || !previewRenderer || !dragging) return null;
    return (
      <div style={pos} className={styles.previewPortalOrigin}>
        {previewRenderer({ readyToDrop })}
      </div>
    );
  }, [dragging, isCurrent, pos, previewRenderer, readyToDrop]);

  return (
    <div
      data-dragging={dragging}
      draggable
      className={clsx(className, styles.trigger)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDrag={onDrag}
    >
      {children}
      {createPortal(Preview, document.body)}
    </div>
  );
};
