import clsx from 'clsx';
import { nanoid } from 'nanoid';
import {
  type DragEvent,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { MIN_PANEL_PERCENT } from './constants';
import { SplitViewContext } from './split-view.context';
import * as styles from './split-view.css';
import type {
  SplitPanel,
  SplitPanelInternal,
  SplitViewRootProps,
} from './types';

const getInsertSlotId = (insertBefore: number) => `insert_slot_${insertBefore}`;

export const SplitViewRoot = ({ className, limit }: SplitViewRootProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  const {
    panels,
    dragging,
    nodeToAppend,
    setPanels,
    readyToDrop,
    setReadyToDrop,
  } = useContext(SplitViewContext);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  // const [readyToDrop, setReadyToDrop] = useState(false);

  // panels to render
  const renderPanels = useMemo(() => {
    if (!panels) return [];

    const width = readyToDrop ? 100 / (panels.length + 1) : 0;

    // TODO: a better strategy to average the width
    // get the largest top 2 panels, and average their width
    const modifyWidthMap = new Map<number, number>();
    if (insertIndex !== null) {
      const sortedPanels = [...panels]
        .map((panel, index) => ({ panel, index }))
        .sort((a, b) => b.panel.percent - a.panel.percent);
      const largestPanels = sortedPanels.slice(0, 2);
      const averageWidth =
        (largestPanels.reduce((sum, { panel }) => sum + panel.percent, 0) -
          width) /
        largestPanels.length;
      largestPanels.forEach(({ index }) =>
        modifyWidthMap.set(index, averageWidth)
      );
    }

    const newPanels: SplitPanelInternal[] = [];

    const addInsertSlot = (index: number, insertHere: boolean) => {
      const disableResize = index === 0 || index === panels.length;
      const type =
        insertHere && readyToDrop
          ? 'insert'
          : disableResize
            ? 'static'
            : 'resize';
      newPanels.push({
        id: getInsertSlotId(index),
        percent: insertHere ? width : 0,
        children: null,
        type,
        index,
      });
    };
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];

      const insertHere = i === insertIndex;
      addInsertSlot(i, insertHere);

      newPanels.push({
        ...panel,
        percent: modifyWidthMap.has(i)
          ? modifyWidthMap.get(i) ?? 0
          : panel.percent,
      });

      if (i === panels.length - 1) {
        addInsertSlot(i + 1, i + 1 === insertIndex);
      }
    }

    return newPanels;
  }, [insertIndex, panels, readyToDrop]);

  const dragFilter = useCallback(
    (_: DragEvent<HTMLDivElement>) => {
      if (panels && limit && panels.length >= limit) return false;
      return !!dragging;
    },
    [dragging, limit, panels]
  );

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dragFilter(event)) return;
      setReadyToDrop?.(true);
    },
    [dragFilter, setReadyToDrop]
  );

  const onDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dragFilter(event)) return;
      setReadyToDrop?.(false);
    },
    [dragFilter, setReadyToDrop]
  );

  const onDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const rootEl = rootRef.current;

      if (!dragFilter(event)) return;
      if (!panels) return;
      if (!rootEl) return;
      event.preventDefault();

      // calculate x,y relative to the root element
      const rootRect = rootEl.getBoundingClientRect();
      const x = event.clientX - rootRect.left;

      // check where to insert the block
      // when only one block
      if (panels?.length === 1) {
        const percent = x / rootRect.width;
        if (percent < 0.5) {
          setInsertIndex(0);
        } else {
          setInsertIndex(1);
        }
      } else {
        const xPercent = Math.ceil((x / rootRect.width) * 100);
        let closestIndex = 0;
        let closestDistancePct = xPercent;
        let closestDistancePx = x;
        let totalDistance = 0;
        for (let i = 0; i < panels.length; i++) {
          totalDistance += panels[i].percent;
          const distancePercent = Math.abs(xPercent - totalDistance);
          if (distancePercent > closestDistancePct) continue;

          closestDistancePct = distancePercent;
          closestDistancePx = Math.abs(
            x - (totalDistance / 100) * rootRect.width
          );
          closestIndex = i + 1;
        }

        if (closestDistancePx < 100) setInsertIndex(closestIndex);
      }
    },
    [dragFilter, panels]
  );

  const onDrop = useCallback(() => {
    setInsertIndex(null);
    setReadyToDrop?.(false);

    const newPanels: SplitPanel[] = [];
    for (const panel of renderPanels) {
      if (!panel.type) {
        newPanels.push(panel);
        continue;
      }

      if (panel.type === 'insert') {
        newPanels.push({
          id: nanoid(),
          percent: panel.percent,
          children: nodeToAppend,
        });
      }
    }
    setPanels?.(newPanels);
  }, [nodeToAppend, renderPanels, setPanels, setReadyToDrop]);

  const onPanelResize = useCallback(
    (index: number, offset: { x: number; y: number }) => {
      const rootRect = rootRef.current?.getBoundingClientRect();

      if (!rootRect) return;

      setPanels?.((prevPanels: SplitPanel[]) => {
        if (!prevPanels) return prevPanels;
        const newPanels: SplitPanel[] = prevPanels.map(p => ({ ...p }));
        const percent = (offset.x / rootRect.width) * 100;

        if (index > 0) {
          newPanels[index - 1].percent += percent;
          if (newPanels[index - 1].percent < MIN_PANEL_PERCENT)
            return prevPanels;
        }
        if (index < newPanels.length) {
          newPanels[index].percent -= percent;
          if (newPanels[index].percent < MIN_PANEL_PERCENT) return prevPanels;
        }
        return newPanels;
      });

      // setPanels?.(newPanels);
    },
    [setPanels]
  );

  // const getHandleResize = useCallback(
  //   (index: number) =>
  //     ({ x }: { x: number }) => {
  //       onPanelResize(index, x);
  //     },
  //   [onPanelResize]
  // );

  return (
    <div
      data-dragging={dragging}
      ref={rootRef}
      className={clsx(className, styles.splitViewRoot)}
    >
      <div className={styles.splitViewPanelsWrapper}>
        {renderPanels.map(panel => {
          if (panel.type) {
            return (
              <ResizeBar
                index={panel.index ?? 1}
                type={panel.type}
                key={panel.id}
                percent={panel.percent}
                onResize={onPanelResize}
              />
            );
          }
          return (
            <div
              className={styles.splitViewPanel}
              style={{ flexGrow: panel.percent }}
              key={panel.id}
            >
              {panel.children}
            </div>
          );
        })}
      </div>

      {dragging ? (
        <div
          data-ready-to-drop={readyToDrop}
          className={styles.splitViewRootDragMask}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        ></div>
      ) : null}
    </div>
  );
};

const ResizeBar = memo(function ResizeBar({
  type,
  percent,
  index,
  onResize,
}: {
  type?: 'resize' | 'insert' | 'static';
  percent: number;
  index: number;
  onResize?: (i: number, offset: { x: number; y: number }) => void;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;
    if (type !== 'resize') return;
    let startPos = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      startPos = { x: e.clientX, y: e.clientY };
      setResizing(true);
    };
    const onMouseMove = (e: MouseEvent) => {
      const newPos = { x: e.clientX, y: e.clientY };
      const diff = { x: newPos.x - startPos.x, y: newPos.y - startPos.y };
      startPos = newPos;
      onResize?.(index, diff);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setResizing(false);
    };

    el.addEventListener('mousedown', onMouseDown);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [index, onResize, type]);

  return (
    <div
      ref={handleRef}
      data-resizing={resizing}
      data-type={type}
      style={{ flexGrow: percent }}
      className={styles.resizeBar}
    ></div>
  );
});
