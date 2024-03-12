import { Menu, MenuIcon, MenuItem, type MenuProps } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  CloseIcon,
  ExpandFullIcon,
  InsertLeftIcon,
  InsertRightIcon,
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
import { SplitViewMenuIndicator } from './indicator';
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
  const ref = useRef<HTMLDivElement>(null);
  const size = useLiveData(view.size);
  const [menuOpen, setMenuOpen] = useState(false);
  const workbench = useService(Workbench);
  const activeView = useLiveData(workbench.activeView);
  const views = useLiveData(workbench.views);
  const {
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    setNodeRef,
    setActivatorNodeRef,
  } = useSortable({ id: view.id, attributes: { role: 'group' } });

  const isActive = activeView === view;

  useEffect(() => {
    if (ref.current) {
      setSlots?.(slots => ({ ...slots, [view.id]: ref }));
    }
  }, [setSlots, view.id]);

  useEffect(() => {
    if (isDragging) {
      setMenuOpen(false);
    }
  }, [isDragging]);

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
  const menuRootOptions = useMemo(
    () =>
      ({
        open: menuOpen,
        onOpenChange: setMenuOpen,
      }) satisfies MenuProps['rootOptions'],
    [menuOpen]
  );
  const menuContentOptions = useMemo(
    () =>
      ({
        align: 'center',
      }) satisfies MenuProps['contentOptions'],
    []
  );

  return (
    <div
      style={style}
      className={styles.splitViewPanel}
      data-is-dragging={isDragging}
    >
      <div
        ref={setNodeRef}
        style={dragStyle}
        className={styles.splitViewPanelDrag}
        {...attributes}
      >
        <div className={styles.splitViewPanelContent} ref={ref} />
        {views.length > 1 ? (
          <Menu
            contentOptions={menuContentOptions}
            items={<SplitViewMenu view={view} />}
            rootOptions={menuRootOptions}
          >
            <SplitViewMenuIndicator
              ref={setActivatorNodeRef}
              active={isDragging || isActive}
              className={styles.menuTrigger}
              {...listeners}
            />
          </Menu>
        ) : null}
      </div>
      {children}
    </div>
  );
});

interface SplitViewMenuProps {
  view: View;
}
const SplitViewMenu = ({ view }: SplitViewMenuProps) => {
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
  const handleFullScreen = useCallback(() => {
    workbench.closeOthers(view);
  }, [view, workbench]);

  const CloseItem =
    views.length > 1 ? (
      <MenuItem
        preFix={<MenuIcon icon={<CloseIcon />} />}
        onClick={handleClose}
      >
        {t['com.affine.workbench.split-view-menu.close']()}
      </MenuItem>
    ) : null;

  const MoveLeftItem =
    viewIndex > 0 && views.length > 1 ? (
      <MenuItem
        onClick={handleMoveLeft}
        preFix={<MenuIcon icon={<InsertLeftIcon />} />}
      >
        {t['com.affine.workbench.split-view-menu.move-left']()}
      </MenuItem>
    ) : null;

  const FullScreenItem =
    views.length > 1 ? (
      <MenuItem
        onClick={handleFullScreen}
        preFix={<MenuIcon icon={<ExpandFullIcon />} />}
      >
        {t['com.affine.workbench.split-view-menu.full-screen']()}
      </MenuItem>
    ) : null;

  const MoveRightItem =
    viewIndex < views.length - 1 ? (
      <MenuItem
        onClick={handleMoveRight}
        preFix={<MenuIcon icon={<InsertRightIcon />} />}
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
