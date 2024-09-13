import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
} from '@dnd-kit/sortable';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import type { HTMLAttributes, PropsWithChildren, RefObject } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { View } from '../../entities/view';
import { WorkbenchService } from '../../services/workbench';
import { SplitViewPanel, SplitViewPanelContainer } from './panel';
import { ResizeHandle } from './resize-handle';
import * as styles from './split-view.css';

export interface SplitViewProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * ⚠️ `vertical` orientation is not supported yet
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
  views: View[];
  renderer: (item: View, index: number) => React.ReactNode;
  onMove?: (from: number, to: number) => void;
}

type SlotsMap = Record<View['id'], RefObject<HTMLDivElement | null>>;
// TODO(@catsjuice): vertical orientation support
export const SplitView = ({
  orientation = 'horizontal',
  className,
  views,
  renderer,
  onMove,
  ...attrs
}: SplitViewProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<SlotsMap>({});
  const [resizingViewId, setResizingViewId] = useState<View['id'] | null>(null);
  const { appSettings } = useAppSettingHelper();
  const workbench = useService(WorkbenchService).workbench;

  const sensors = useSensors(
    useSensor(
      PointerSensor,
      useMemo(
        /* avoid re-rendering */
        () => ({
          activationConstraint: {
            distance: 0,
          },
        }),
        []
      )
    )
  );

  const onResizing = useCallback(
    (index: number, { x, y }: { x: number; y: number }) => {
      const rootEl = rootRef.current;
      if (!rootEl) return;

      const rootRect = rootEl.getBoundingClientRect();
      const offset = orientation === 'horizontal' ? x : y;
      const total =
        orientation === 'horizontal' ? rootRect.width : rootRect.height;

      const percent = offset / total;
      workbench.resize(index, percent);
    },
    [orientation, workbench]
  );

  const resizeHandleRenderer = useCallback(
    (view: View, index: number) =>
      index < views.length - 1 ? (
        <ResizeHandle
          resizing={resizingViewId === view.id}
          onResizeStart={() => setResizingViewId(view.id)}
          onResizeEnd={() => setResizingViewId(null)}
          onResizing={dxy => onResizing(index, dxy)}
        />
      ) : null,
    [onResizing, resizingViewId, views.length]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        // update order
        const fromIndex = views.findIndex(v => v.id === active.id);
        const toIndex = views.findIndex(v => v.id === over?.id);
        onMove?.(fromIndex, toIndex);
      }
    },
    [onMove, views]
  );

  return (
    <div
      ref={rootRef}
      className={clsx(styles.splitViewRoot, className)}
      data-orientation={orientation}
      data-client-border={appSettings.clientBorder}
      {...attrs}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={views} strategy={horizontalListSortingStrategy}>
          {views.map((view, index) => (
            <SplitViewPanel view={view} key={view.id} setSlots={setSlots}>
              {resizeHandleRenderer(view, index)}
            </SplitViewPanel>
          ))}
        </SortableContext>
      </DndContext>

      {views.map((view, index) => {
        const slot = slots[view.id]?.current;
        if (!slot) return null;
        return createPortal(
          renderer(view, index),
          slot,
          `portalToSplitViewPanel_${view.id}`
        );
      })}
    </div>
  );
};

export const SplitViewFallback = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => {
  const { appSettings } = useAppSettingHelper();

  return (
    <div
      className={clsx(styles.splitViewRoot, className)}
      data-client-border={appSettings.clientBorder}
    >
      {/* todo: support multiple split views */}
      <SplitViewPanelContainer>{children}</SplitViewPanelContainer>
    </div>
  );
};
