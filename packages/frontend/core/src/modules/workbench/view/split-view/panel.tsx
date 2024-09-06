import { MenuItem } from '@affine/component';
import { useI18n } from '@affine/i18n';
import {
  ExpandCloseIcon,
  MoveToLeftDuotoneIcon,
  MoveToRightDuotoneIcon,
  SoloViewIcon,
} from '@blocksuite/icons/rc';
import { useSortable } from '@dnd-kit/sortable';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import type { SetStateAction } from 'jotai';
import type {
  Dispatch,
  HTMLAttributes,
  PropsWithChildren,
  RefObject,
} from 'react';
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { View } from '../../entities/view';
import { WorkbenchService } from '../../services/workbench';
import { SplitViewIndicator } from './indicator';
import * as styles from './split-view.css';

export interface SplitViewPanelProps
  extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  view: View;
  resizeHandle?: React.ReactNode;
  setSlots?: Dispatch<
    SetStateAction<Record<string, RefObject<HTMLDivElement | null>>>
  >;
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

export const SplitViewPanel = memo(function SplitViewPanel({
  children,
  view,
  setSlots,
}: SplitViewPanelProps) {
  const [indicatorPressed, setIndicatorPressed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const size = useLiveData(view.size$);
  const workbench = useService(WorkbenchService).workbench;
  const activeView = useLiveData(workbench.activeView$);
  const views = useLiveData(workbench.views$);
  const isLast = views[views.length - 1] === view;

  const {
    attributes,
    listeners,
    transform,
    transition,
    isDragging: dndIsDragging,
    setNodeRef,
  } = useSortable({ id: view.id, attributes: { role: 'group' } });

  const isDragging = dndIsDragging || indicatorPressed;
  const isActive = activeView === view;

  useLayoutEffect(() => {
    if (ref.current) {
      setSlots?.(slots => ({ ...slots, [view.id]: ref }));
    }
  }, [setSlots, view.id]);

  const style = useMemo(
    () => ({
      ...assignInlineVars({ '--size': size.toString() }),
    }),
    [size]
  );
  const dragStyle = useMemo(
    () => ({
      transform: `translate3d(${transform?.x ?? 0}px, 0, 0)`,
      transition,
    }),
    [transform, transition]
  );

  return (
    <SplitViewPanelContainer
      style={style}
      data-is-dragging={isDragging}
      data-is-active={isActive && views.length > 1}
      data-is-last={isLast}
    >
      <div
        ref={setNodeRef}
        style={dragStyle}
        className={styles.splitViewPanelDrag}
        {...attributes}
      >
        <div className={styles.splitViewPanelContent} ref={ref} />
        {views.length > 1 ? (
          <SplitViewIndicator
            listeners={listeners}
            isDragging={isDragging}
            isActive={isActive}
            menuItems={<SplitViewMenu view={view} />}
            setPressed={setIndicatorPressed}
          />
        ) : null}
      </div>
      {children}
    </SplitViewPanelContainer>
  );
});

const SplitViewMenu = ({ view }: { view: View }) => {
  const t = useI18n();
  const workbench = useService(WorkbenchService).workbench;
  const views = useLiveData(workbench.views$);

  const viewIndex = views.findIndex(v => v === view);

  const handleClose = useCallback(
    () => workbench.close(view),
    [view, workbench]
  );
  const handleMoveLeft = useCallback(() => {
    workbench.moveView(viewIndex, viewIndex - 1);
  }, [viewIndex, workbench]);
  const handleMoveRight = useCallback(() => {
    workbench.moveView(viewIndex, viewIndex + 1);
  }, [viewIndex, workbench]);
  const handleCloseOthers = useCallback(() => {
    workbench.closeOthers(view);
  }, [view, workbench]);

  const CloseItem =
    views.length > 1 ? (
      <MenuItem prefixIcon={<ExpandCloseIcon />} onClick={handleClose}>
        {t['com.affine.workbench.split-view-menu.close']()}
      </MenuItem>
    ) : null;

  const MoveLeftItem =
    viewIndex > 0 && views.length > 1 ? (
      <MenuItem onClick={handleMoveLeft} prefixIcon={<MoveToLeftDuotoneIcon />}>
        {t['com.affine.workbench.split-view-menu.move-left']()}
      </MenuItem>
    ) : null;

  const FullScreenItem =
    views.length > 1 ? (
      <MenuItem onClick={handleCloseOthers} prefixIcon={<SoloViewIcon />}>
        {t['com.affine.workbench.split-view-menu.keep-this-one']()}
      </MenuItem>
    ) : null;

  const MoveRightItem =
    viewIndex < views.length - 1 ? (
      <MenuItem
        onClick={handleMoveRight}
        prefixIcon={<MoveToRightDuotoneIcon />}
      >
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
