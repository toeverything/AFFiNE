import {
  type DropTargetDragEvent,
  MenuItem,
  shallowUpdater,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  CloseIcon,
  ExpandFullIcon,
  InsertLeftIcon,
  InsertRightIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useAtom } from 'jotai';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { memo, useCallback, useMemo } from 'react';

import type { View } from '../../entities/view';
import { WorkbenchService } from '../../services/workbench';
import { SplitViewIndicator } from './indicator';
import { ResizeHandle } from './resize-handle';
import * as styles from './split-view.css';
import {
  draggingOverViewAtom,
  draggingViewAtom,
  resizingViewAtom,
} from './state';
import { allowedSplitViewEntityTypes } from './types';

export interface SplitViewPanelProps
  extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  view: View;
  index: number;
  resizeHandle?: React.ReactNode;
  onMove: (from: number, to: number) => void;
  onResizing: (dxy: { x: number; y: number }) => void;
  draggingEntity: boolean;
}

export const SplitViewPanelContainer = ({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={styles.splitViewPanel} {...props}>
      {children}
    </div>
  );
};

/**
 * Calculate the order of the panel
 */
function calculateOrder(
  index: number,
  draggingIndex: number,
  droppingIndex: number
) {
  // If not dragging or invalid indices, return original index
  if (draggingIndex === -1 || draggingIndex < 0 || droppingIndex < 0) {
    return index;
  }

  // If this is the dragging item, move it to the dropping position
  if (index === draggingIndex) {
    return droppingIndex;
  }

  // If dropping before the dragging item
  if (droppingIndex < draggingIndex) {
    // Items between drop and drag positions shift right
    if (index >= droppingIndex && index < draggingIndex) {
      return index + 1;
    }
  }
  // If dropping after the dragging item
  else if (
    droppingIndex > draggingIndex &&
    index > draggingIndex &&
    index <= droppingIndex
  ) {
    // Items between drag and drop positions shift left
    return index - 1;
  }

  // For all other items, keep their original position
  return index;
}

export const SplitViewPanel = memo(function SplitViewPanel({
  children,
  view,
  onMove,
  onResizing,
  draggingEntity,
  index,
}: SplitViewPanelProps) {
  const size = useLiveData(view.size$);
  const workbench = useService(WorkbenchService).workbench;

  const activeView = useLiveData(workbench.activeView$);
  const views = useLiveData(workbench.views$);

  const isActive = activeView === view;

  const [draggingView, setDraggingView] = useAtom(draggingViewAtom);
  const [draggingOverView, setDraggingOverView] = useAtom(draggingOverViewAtom);
  const [resizingView, setResizingView] = useAtom(resizingViewAtom);

  const order = useMemo(
    () =>
      calculateOrder(
        index,
        draggingView?.index ?? -1,
        draggingOverView?.index ?? -1
      ),
    [index, draggingView, draggingOverView]
  );

  const isFirst = order === 0;
  const isLast = views.length - 1 === order;

  const style = useMemo(() => {
    return {
      ...assignInlineVars({
        [styles.size]: size.toString(),
        [styles.panelOrder]: order.toString(),
      }),
    };
  }, [size, order]);

  const { dropTargetRef } = useDropTarget<AffineDNDData>(() => {
    const handleDrag = (data: DropTargetDragEvent<AffineDNDData>) => {
      // only the first view has left edge
      const edge = data.closestEdge as 'left' | 'right';
      const switchEdge = edge === 'left' && !isFirst;

      const newDraggingOver = {
        view: switchEdge ? views[index - 1] : view,
        index: order,
        edge: switchEdge ? 'right' : edge,
      };

      setDraggingOverView(shallowUpdater(newDraggingOver));
    };

    return {
      closestEdge: {
        allowedEdges: ['left', 'right'],
      },
      isSticky: true,
      canDrop(data) {
        const entityType = data.source.data.entity?.type;
        return (
          (BUILD_CONFIG.isElectron &&
            data.source.data.from?.at === 'workbench:view') ||
          data.source.data.from?.at === 'workbench:link' ||
          (!!entityType && allowedSplitViewEntityTypes.has(entityType))
        );
      },
      onDragEnter: handleDrag,
      onDrag: handleDrag,
    };
  }, [index, isFirst, order, setDraggingOverView, view, views]);

  const { dragRef } = useDraggable<AffineDNDData>(() => {
    return {
      data: () => {
        return {
          from: {
            at: 'workbench:view',
            viewId: view.id,
          },
        };
      },
      onDrop() {
        if (order !== index && draggingOverView) {
          onMove?.(index, draggingOverView.index);
        }
        setDraggingView(null);
        setDraggingOverView(null);
        track.$.splitViewIndicator.$.splitViewAction({
          control: 'indicator',
          action: 'move',
        });
      },
      onDragStart() {
        setDraggingView({
          view,
          index: order,
        });
      },
      canDrag() {
        return BUILD_CONFIG.isElectron && views.length > 1;
      },
      disableDragPreview: true,
    };
  }, [
    draggingOverView,
    index,
    onMove,
    order,
    setDraggingOverView,
    setDraggingView,
    view,
    views.length,
  ]);

  const dragging = draggingView?.view.id === view.id;

  const onResizeStart = useCallback(() => {
    setResizingView({ view, index });
  }, [setResizingView, view, index]);

  const onResizeEnd = useCallback(() => {
    setResizingView(null);
  }, [setResizingView]);

  const indicatingEdge =
    draggingOverView?.view === view ? draggingOverView.edge : null;

  return (
    <SplitViewPanelContainer
      style={style}
      data-is-resizing={!!resizingView}
      data-is-reordering={!!draggingView}
      data-is-dragging={dragging}
      data-is-active={isActive && views.length > 1}
      data-is-first={isFirst}
      data-is-last={isLast}
      data-testid="split-view-panel"
    >
      {isFirst ? (
        <ResizeHandle
          edge="left"
          view={view}
          state={
            draggingEntity && indicatingEdge === 'left'
              ? 'drop-indicator'
              : 'idle'
          }
        />
      ) : null}
      <div
        ref={dropTargetRef}
        data-is-active={isActive && views.length > 1 && !draggingEntity}
        className={styles.splitViewPanelDrag}
      >
        <div draggable={false} className={styles.splitViewPanelContent}>
          {children}
        </div>
        {views.length > 1 && onMove ? (
          <SplitViewIndicator
            view={view}
            isActive={isActive}
            isDragging={dragging}
            dragHandleRef={dragRef}
            menuItems={<SplitViewMenu view={view} onMove={onMove} />}
          />
        ) : null}
      </div>
      {!draggingView ? (
        <ResizeHandle
          edge="right"
          view={view}
          state={
            resizingView?.view.id === view.id
              ? 'resizing'
              : draggingEntity && indicatingEdge === 'right'
                ? 'drop-indicator'
                : 'idle'
          }
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
          onResizing={onResizing}
        />
      ) : null}
    </SplitViewPanelContainer>
  );
});

const SplitViewMenu = ({
  view,
  onMove,
}: {
  view: View;
  onMove: (from: number, to: number) => void;
}) => {
  const t = useI18n();
  const workbench = useService(WorkbenchService).workbench;
  const views = useLiveData(workbench.views$);

  const viewIndex = views.findIndex(v => v === view);

  const handleClose = useCallback(() => {
    workbench.close(view);
    track.$.splitViewIndicator.$.splitViewAction({
      control: 'menu',
      action: 'close',
    });
  }, [view, workbench]);
  const handleMoveLeft = useCallback(() => {
    onMove(viewIndex, viewIndex - 1);
    track.$.splitViewIndicator.$.splitViewAction({
      control: 'menu',
      action: 'move',
    });
  }, [onMove, viewIndex]);
  const handleMoveRight = useCallback(() => {
    onMove(viewIndex, viewIndex + 1);
    track.$.splitViewIndicator.$.splitViewAction({
      control: 'menu',
      action: 'move',
    });
  }, [onMove, viewIndex]);
  const handleCloseOthers = useCallback(() => {
    workbench.closeOthers(view);
    track.$.splitViewIndicator.$.splitViewAction({
      control: 'menu',
      action: 'closeOthers',
    });
  }, [view, workbench]);

  const CloseItem =
    views.length > 1 ? (
      <MenuItem prefixIcon={<CloseIcon />} onClick={handleClose}>
        {t['com.affine.workbench.split-view-menu.close']()}
      </MenuItem>
    ) : null;

  const MoveLeftItem =
    viewIndex > 0 && views.length > 1 ? (
      <MenuItem onClick={handleMoveLeft} prefixIcon={<InsertRightIcon />}>
        {t['com.affine.workbench.split-view-menu.move-left']()}
      </MenuItem>
    ) : null;

  const FullScreenItem =
    views.length > 1 ? (
      <MenuItem onClick={handleCloseOthers} prefixIcon={<ExpandFullIcon />}>
        {t['com.affine.workbench.split-view-menu.keep-this-one']()}
      </MenuItem>
    ) : null;

  const MoveRightItem =
    viewIndex < views.length - 1 ? (
      <MenuItem onClick={handleMoveRight} prefixIcon={<InsertLeftIcon />}>
        {t['com.affine.workbench.split-view-menu.move-right']()}
      </MenuItem>
    ) : null;
  return (
    <>
      {MoveRightItem}
      {MoveLeftItem}
      {FullScreenItem}
      {CloseItem}
    </>
  );
};
