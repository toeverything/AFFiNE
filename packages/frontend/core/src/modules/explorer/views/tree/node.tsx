import {
  DropIndicator,
  type DropTargetDropEvent,
  type DropTargetOptions,
  type DropTargetTreeInstruction,
  IconButton,
  Menu,
  MenuItem,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import { RenameModal } from '@affine/component/rename-modal';
import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { extractEmojiIcon } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import {
  ArrowDownSmallIcon,
  EditIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type { To } from 'history';
import {
  Fragment,
  type RefAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ExplorerTreeContext } from './context';
import { DropEffect } from './drop-effect';
import * as styles from './node.css';
import type { NodeOperation } from './types';

export type ExplorerTreeNodeDropEffectData = {
  source: { data: AffineDNDData['draggable'] };
  treeInstruction: DropTargetTreeInstruction | null;
};
export type ExplorerTreeNodeDropEffect = (
  data: ExplorerTreeNodeDropEffectData
) => 'copy' | 'move' | 'link' | undefined;
export type ExplorerTreeNodeIcon = React.ComponentType<{
  className?: string;
  draggedOver?: boolean;
  treeInstruction?: DropTargetTreeInstruction | null;
  collapsed?: boolean;
}>;

export interface BaseExplorerTreeNodeProps {
  name?: string;
  icon?: ExplorerTreeNodeIcon;
  children?: React.ReactNode;
  active?: boolean;
  defaultRenaming?: boolean;
  extractEmojiAsIcon?: boolean;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  renameable?: boolean;
  onRename?: (newName: string) => void;
  disabled?: boolean;
  onClick?: () => void;
  to?: To;
  postfix?: React.ReactNode;
  operations?: NodeOperation[];
  childrenOperations?: NodeOperation[];
  childrenPlaceholder?: React.ReactNode;
  linkComponent?: React.ComponentType<
    React.PropsWithChildren<{ to: To; className?: string }> & RefAttributes<any>
  >;
  [key: `data-${string}`]: any;
}

interface WebExplorerTreeNodeProps extends BaseExplorerTreeNodeProps {
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  reorderable?: boolean;
  dndData?: AffineDNDData;
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  dropEffect?: ExplorerTreeNodeDropEffect;
}

export const ExplorerTreeNode = ({
  children,
  icon: Icon,
  name: rawName,
  onClick,
  to,
  active,
  defaultRenaming,
  renameable,
  onRename,
  disabled,
  collapsed,
  extractEmojiAsIcon,
  setCollapsed,
  canDrop,
  reorderable = true,
  operations = [],
  postfix,
  childrenOperations = [],
  childrenPlaceholder,
  linkComponent: LinkComponent = WorkbenchLink,
  dndData,
  onDrop,
  dropEffect,
  ...otherProps
}: WebExplorerTreeNodeProps) => {
  const t = useI18n();
  const cid = useId();
  const context = useContext(ExplorerTreeContext);
  const level = context?.level ?? 0;
  // If no onClick or to is provided, clicking on the node will toggle the collapse state
  const clickForCollapse = !onClick && !to && !disabled;
  const [childCount, setChildCount] = useState(0);
  const [renaming, setRenaming] = useState(defaultRenaming);
  const [lastInGroup, setLastInGroup] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const appSidebarService = useService(AppSidebarService).sidebar;
  const sidebarWidth = useLiveData(appSidebarService.width$);

  const { emoji, name } = useMemo(() => {
    if (!extractEmojiAsIcon || !rawName) {
      return {
        emoji: null,
        name: rawName,
      };
    }
    const { emoji, rest } = extractEmojiIcon(rawName);
    return {
      emoji,
      name: rest,
    };
  }, [extractEmojiAsIcon, rawName]);
  const { dragRef, dragging, CustomDragPreview } = useDraggable<
    AffineDNDData & { draggable: { __cid: string } }
  >(
    () => ({
      data: { ...dndData?.draggable, __cid: cid },
      dragPreviewPosition: 'pointer-outside',
    }),
    [cid, dndData]
  );
  const handleCanDrop = useMemo<DropTargetOptions<AffineDNDData>['canDrop']>(
    () => args => {
      if (!reorderable && args.treeInstruction?.type !== 'make-child') {
        return false;
      }
      return (typeof canDrop === 'function' ? canDrop(args) : canDrop) ?? true;
    },
    [canDrop, reorderable]
  );
  const {
    dropTargetRef,
    treeInstruction,
    draggedOverDraggable,
    draggedOver,
    draggedOverPosition,
  } = useDropTarget<AffineDNDData & { draggable: { __cid: string } }>(
    () => ({
      data: dndData?.dropTarget,
      treeInstruction: {
        currentLevel: level,
        indentPerLevel: 20,
        mode: !collapsed
          ? 'expanded'
          : lastInGroup
            ? 'last-in-group'
            : 'standard',
        block:
          reorderable === false
            ? ['reorder-above', 'reorder-below', 'reparent']
            : [],
      },
      onDrop: data => {
        if (
          data.source.data.__cid === cid &&
          data.treeInstruction?.type !== 'reparent'
        ) {
          // Do nothing if dropped on self
          return;
        }
        onDrop?.(data);
        if (data.treeInstruction?.type === 'make-child') {
          setCollapsed(false);
        }
      },
      canDrop: handleCanDrop,
    }),
    [
      dndData?.dropTarget,
      level,
      collapsed,
      lastInGroup,
      reorderable,
      handleCanDrop,
      cid,
      onDrop,
      setCollapsed,
    ]
  );
  const isSelfDraggedOver = draggedOverDraggable?.data.__cid === cid;

  useEffect(() => {
    if (
      draggedOver &&
      treeInstruction?.type === 'make-child' &&
      !isSelfDraggedOver
    ) {
      // auto expand when dragged over
      const timeout = setTimeout(() => {
        setCollapsed(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
    return;
  }, [draggedOver, isSelfDraggedOver, setCollapsed, treeInstruction?.type]);

  useEffect(() => {
    if (rootRef.current) {
      const parent = rootRef.current.parentElement;
      if (parent) {
        const updateLastInGroup = () => {
          setLastInGroup(parent?.lastElementChild === rootRef.current);
        };
        updateLastInGroup();
        const observer = new MutationObserver(updateLastInGroup);
        observer.observe(parent, {
          childList: true,
        });
        return () => observer.disconnect();
      }
    }
    return;
  }, []);

  const presetOperations = useMemo(
    () =>
      (
        [
          renameable
            ? {
                index: 0,
                view: (
                  <MenuItem
                    key={'explorer-tree-rename'}
                    type={'default'}
                    prefixIcon={<EditIcon />}
                    onClick={() => setRenaming(true)}
                  >
                    {t['com.affine.menu.rename']()}
                  </MenuItem>
                ),
              }
            : null,
        ] as (NodeOperation | null)[]
      ).filter((t): t is NodeOperation => t !== null),
    [renameable, t]
  );

  const { menuOperations, inlineOperations } = useMemo(() => {
    const sorted = [...presetOperations, ...operations].sort(
      (a, b) => a.index - b.index
    );
    return {
      menuOperations: sorted.filter(({ inline }) => !inline),
      inlineOperations: sorted.filter(({ inline }) => !!inline),
    };
  }, [presetOperations, operations]);

  const contextValue = useMemo(() => {
    return {
      operations: childrenOperations,
      level: (context?.level ?? 0) + 1,
      registerChild: () => {
        setChildCount(c => c + 1);
        return () => setChildCount(c => c - 1);
      },
    };
  }, [childrenOperations, context?.level]);

  const handleCollapsedChange = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault(); // for links
      setCollapsed(!collapsed);
    },
    [collapsed, setCollapsed]
  );

  const handleRename = useCallback(
    (newName: string) => {
      onRename?.(newName);
    },
    [onRename]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.defaultPrevented) {
        return;
      }
      if (!clickForCollapse) {
        onClick?.();
      } else {
        setCollapsed(!collapsed);
      }
    },
    [clickForCollapse, collapsed, onClick, setCollapsed]
  );

  const content = (
    <div
      onClick={handleClick}
      className={styles.itemRoot}
      data-active={active}
      data-disabled={disabled}
    >
      <div
        data-disabled={disabled}
        onClick={handleCollapsedChange}
        data-testid="explorer-collapsed-button"
        className={styles.collapsedIconContainer}
      >
        <ArrowDownSmallIcon
          className={styles.collapsedIcon}
          data-collapsed={collapsed !== false}
        />
      </div>

      <div className={styles.itemMain}>
        <div className={styles.iconContainer}>
          {emoji ??
            (Icon && (
              <Icon
                draggedOver={draggedOver && !isSelfDraggedOver}
                treeInstruction={treeInstruction}
                collapsed={collapsed}
              />
            ))}
        </div>
        <div className={styles.itemContent}>{name}</div>
        {postfix}
        <div
          className={styles.postfix}
          onClick={e => {
            // prevent jump to page
            e.preventDefault();
          }}
        >
          {inlineOperations.map(({ view }, index) => (
            <Fragment key={index}>{view}</Fragment>
          ))}
          {menuOperations.length > 0 && (
            <Menu
              items={menuOperations.map(({ view }, index) => (
                <Fragment key={index}>{view}</Fragment>
              ))}
            >
              <IconButton
                size="16"
                data-testid="explorer-tree-node-operation-button"
                style={{ marginLeft: 4 }}
              >
                <MoreHorizontalIcon />
              </IconButton>
            </Menu>
          )}
        </div>
      </div>

      {renameable && (
        <RenameModal
          open={!!renaming}
          width={sidebarWidth - 32}
          onOpenChange={setRenaming}
          onRename={handleRename}
          currentName={rawName ?? ''}
        >
          <div className={styles.itemRenameAnchor} />
        </RenameModal>
      )}
    </div>
  );

  return (
    <Collapsible.Root
      open={!collapsed}
      onOpenChange={setCollapsed}
      style={assignInlineVars({
        [styles.levelIndent]: `${level * 20}px`,
      })}
      ref={rootRef}
      {...otherProps}
    >
      <div
        className={clsx(styles.contentContainer, styles.draggedOverEffect)}
        data-open={!collapsed}
        data-self-dragged-over={isSelfDraggedOver}
        ref={dropTargetRef}
      >
        {to ? (
          <LinkComponent to={to} className={styles.linkItemRoot} ref={dragRef}>
            {content}
          </LinkComponent>
        ) : (
          <div ref={dragRef}>{content}</div>
        )}
        <CustomDragPreview>
          <div className={styles.draggingContainer}>{content}</div>
        </CustomDragPreview>
        {treeInstruction &&
          // Do not show drop indicator for self dragged over
          !(treeInstruction.type !== 'reparent' && isSelfDraggedOver) &&
          treeInstruction.type !== 'instruction-blocked' && (
            <DropIndicator instruction={treeInstruction} />
          )}
        {draggedOver &&
          dropEffect &&
          draggedOverPosition &&
          !isSelfDraggedOver &&
          draggedOverDraggable && (
            <DropEffect
              dropEffect={dropEffect({
                source: draggedOverDraggable,
                treeInstruction: treeInstruction,
              })}
              position={draggedOverPosition}
            />
          )}
      </div>
      <Collapsible.Content style={{ display: dragging ? 'none' : undefined }}>
        {/* For lastInGroup check, the placeholder must be placed above all children in the dom */}
        <div className={styles.collapseContentPlaceholder}>
          {childCount === 0 && !collapsed && childrenPlaceholder}
        </div>
        <ExplorerTreeContext.Provider value={contextValue}>
          {collapsed ? null : children}
        </ExplorerTreeContext.Provider>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
