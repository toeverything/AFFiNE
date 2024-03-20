import { MenuIcon, MenuItem } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ExpandCloseIcon,
  MoveToLeftIcon,
  MoveToRightIcon,
  SoloViewIcon,
} from '@blocksuite/icons';
import { useSortable } from '@dnd-kit/sortable';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import type { SetStateAction } from 'jotai';
import {
  type Dispatch,
  type HTMLAttributes,
  memo,
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { View } from '../../entities/view';
import { Workbench } from '../../entities/workbench';
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

export const SplitViewPanel = memo(function SplitViewPanel({
  children,
  view,
  setSlots,
}: SplitViewPanelProps) {
  const [indicatorPressed, setIndicatorPressed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const size = useLiveData(view.size);
  const workbench = useService(Workbench);
  const activeView = useLiveData(workbench.activeView);
  const views = useLiveData(workbench.views);
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

  useEffect(() => {
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
    <div
      style={style}
      className={styles.splitViewPanel}
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
    </div>
  );
});

const SplitViewMenu = ({ view }: { view: View }) => {
  const t = useAFFiNEI18N();
  const workbench = useService(Workbench);
  const views = useLiveData(workbench.views);

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
      <MenuItem
        preFix={<MenuIcon icon={<ExpandCloseIcon />} />}
        onClick={handleClose}
      >
        {t['com.affine.workbench.split-view-menu.close']()}
      </MenuItem>
    ) : null;

  const MoveLeftItem =
    viewIndex > 0 && views.length > 1 ? (
      <MenuItem
        onClick={handleMoveLeft}
        preFix={<MenuIcon icon={<MoveToLeftIcon />} />}
      >
        {t['com.affine.workbench.split-view-menu.move-left']()}
      </MenuItem>
    ) : null;

  const FullScreenItem =
    views.length > 1 ? (
      <MenuItem
        onClick={handleCloseOthers}
        preFix={<MenuIcon icon={<SoloViewIcon />} />}
      >
        {t['com.affine.workbench.split-view-menu.keep-this-one']()}
      </MenuItem>
    ) : null;

  const MoveRightItem =
    viewIndex < views.length - 1 ? (
      <MenuItem
        onClick={handleMoveRight}
        preFix={<MenuIcon icon={<MoveToRightIcon />} />}
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
