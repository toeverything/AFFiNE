import {
  ContextMenu,
  DropIndicator,
  type DropTargetDropEvent,
  type DropTargetOptions,
  type DropTargetTreeInstruction,
  IconAndNameEditorMenu,
  IconButton,
  type IconData,
  IconRenderer,
  Menu,
  MenuItem,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import { Guard } from '@affine/core/components/guard';
import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import { ExplorerIconService } from '@affine/core/modules/explorer-icon/services/explorer-icon';
import type { ExplorerType } from '@affine/core/modules/explorer-icon/store/explorer-icon';
import type { DocPermissionActions } from '@affine/core/modules/permissions';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
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

import { NavigationPanelTreeContext } from './context';
import { DropEffect } from './drop-effect';
import * as styles from './node.css';
import type { NodeOperation } from './types';

export type NavigationPanelTreeNodeDropEffectData = {
  source: { data: AffineDNDData['draggable'] };
  treeInstruction: DropTargetTreeInstruction | null;
};
export type NavigationPanelTreeNodeDropEffect = (
  data: NavigationPanelTreeNodeDropEffectData
) => 'copy' | 'move' | 'link' | undefined;
export type NavigationPanelTreeNodeIcon = React.ComponentType<{
  className?: string;
  draggedOver?: boolean;
  treeInstruction?: DropTargetTreeInstruction | null;
  collapsed?: boolean;
}>;

export interface BaseNavigationPanelTreeNodeProps {
  name?: string;
  icon?: NavigationPanelTreeNodeIcon;
  children?: React.ReactNode;
  active?: boolean;
  extractEmojiAsIcon?: boolean;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  collapsible?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  to?: To;
  postfix?: React.ReactNode;
  operations?: NodeOperation[];
  childrenOperations?: NodeOperation[];
  childrenPlaceholder?: React.ReactNode;

  linkComponent?: React.ComponentType<
    React.PropsWithChildren<{ to: To; className?: string }> &
      RefAttributes<any> & { draggable?: boolean }
  >;
  [key: `data-${string}`]: any;
}

type ExplorerIconConfig = {
  where: ExplorerType;
  id: string;
};
interface WebNavigationPanelTreeNodeProps extends BaseNavigationPanelTreeNodeProps {
  renameable?: boolean;
  onRename?: (newName: string) => void;
  renameableGuard?: { docId: string; action: DocPermissionActions };
  defaultRenaming?: boolean;

  explorerIconConfig?: ExplorerIconConfig | null;

  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  reorderable?: boolean;
  dndData?: AffineDNDData;
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  dropEffect?: NavigationPanelTreeNodeDropEffect;
}

/**
 * specific rename modal for navigation panel tree node,
 * Separate it into a separate component to prevent re-rendering the entire component when width changes.
 */
export const NavigationPanelTreeNodeRenameModal = ({
  setRenaming,
  handleRename,
  rawName,
  explorerIconConfig,
  className,
  fallbackIcon,
}: {
  setRenaming: (renaming: boolean) => void;
  handleRename: (newName: string) => void;
  rawName: string | undefined;
  className?: string;
  explorerIconConfig?: ExplorerIconConfig | null;
  fallbackIcon?: React.ReactNode;
}) => {
  const explorerIconService = useService(ExplorerIconService);
  const appSidebarService = useService(AppSidebarService).sidebar;
  const sidebarWidth = useLiveData(appSidebarService.width$);

  const explorerIcon = useLiveData(
    useMemo(
      () =>
        explorerIconConfig
          ? explorerIconService.icon$(
              explorerIconConfig.where,
              explorerIconConfig.id
            )
          : null,
      [explorerIconConfig, explorerIconService]
    )
  );

  const onIconChange = useCallback(
    (data?: IconData) => {
      if (!explorerIconConfig) return;
      explorerIconService.setIcon({
        where: explorerIconConfig.where,
        id: explorerIconConfig.id,
        icon: data,
      });
    },
    [explorerIconConfig, explorerIconService]
  );

  return (
    <IconAndNameEditorMenu
      open
      onOpenChange={setRenaming}
      onIconChange={onIconChange}
      onNameChange={handleRename}
      name={rawName ?? ''}
      icon={explorerIcon?.icon}
      width={sidebarWidth - 16}
      contentOptions={{
        sideOffset: 36,
      }}
      iconPlaceholder={fallbackIcon}
      inputTestId="rename-modal-input"
    >
      <div className={clsx(styles.itemRenameAnchor, className)} />
    </IconAndNameEditorMenu>
  );
};

export const NavigationPanelTreeNode = ({
  children,
  icon: Icon,
  name: rawName,
  onClick,
  to,
  active,
  defaultRenaming,
  renameable,
  renameableGuard,
  onRename,
  disabled,
  collapsed,
  setCollapsed,
  collapsible = true,
  canDrop,
  reorderable = true,
  operations = [],
  postfix,
  childrenOperations = [],
  childrenPlaceholder,
  linkComponent: LinkComponent = WorkbenchLink,
  dndData,
  explorerIconConfig,
  onDrop,
  dropEffect,
  ...otherProps
}: WebNavigationPanelTreeNodeProps) => {
  const explorerIconService = useService(ExplorerIconService);
  const t = useI18n();
  const cid = useId();
  const context = useContext(NavigationPanelTreeContext);
  const level = context?.level ?? 0;
  // If no onClick or to is provided, clicking on the node will toggle the collapse state
  const clickForCollapse = !onClick && !to && !disabled;
  const [childCount, setChildCount] = useState(0);
  const [renaming, setRenaming] = useState(defaultRenaming);
  const [lastInGroup, setLastInGroup] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const explorerIcon = useLiveData(
    useMemo(
      () =>
        explorerIconConfig
          ? explorerIconService.icon$(
              explorerIconConfig?.where,
              explorerIconConfig?.id
            )
          : null,
      [explorerIconConfig, explorerIconService]
    )
  );

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
        if (data.treeInstruction?.type === 'make-child' && collapsible) {
          setCollapsed(false);
        }
      },
      canDrop: handleCanDrop,
      allowExternal: true,
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
      collapsible,
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
      if (!collapsible) return;
      // auto expand when dragged over
      const timeout = setTimeout(() => {
        setCollapsed(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
    return;
  }, [
    collapsible,
    draggedOver,
    isSelfDraggedOver,
    setCollapsed,
    treeInstruction?.type,
  ]);

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
                view: renameableGuard ? (
                  <Guard
                    permission={renameableGuard.action}
                    docId={renameableGuard.docId}
                  >
                    {can => (
                      <MenuItem
                        key={'navigation-panel-tree-rename'}
                        type={'default'}
                        prefixIcon={<EditIcon />}
                        onClick={() => setRenaming(true)}
                        disabled={!can}
                      >
                        {t['com.affine.menu.rename']()}
                      </MenuItem>
                    )}
                  </Guard>
                ) : (
                  <MenuItem
                    key={'navigation-panel-tree-rename'}
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
    [renameable, renameableGuard, t]
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
      if (!collapsible) return;
      setCollapsed(!collapsed);
    },
    [collapsed, collapsible, setCollapsed]
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
      } else if (collapsible) {
        setCollapsed(!collapsed);
      }
    },
    [clickForCollapse, collapsed, collapsible, onClick, setCollapsed]
  );

  const fallbackIcon = Icon && (
    <Icon
      draggedOver={draggedOver && !isSelfDraggedOver}
      treeInstruction={treeInstruction}
      collapsed={collapsed}
    />
  );

  const content = (
    <div
      onClick={handleClick}
      className={styles.itemRoot}
      data-active={active}
      data-disabled={disabled}
      data-collapsible={collapsible}
    >
      <div className={styles.toggleIcon}>
        <div
          data-disabled={disabled}
          onClick={handleCollapsedChange}
          data-testid="navigation-panel-collapsed-button"
          className={styles.collapsedIconContainer}
        >
          <ArrowDownSmallIcon
            className={styles.collapsedIcon}
            data-collapsed={collapsed !== false}
          />
        </div>
        <div className={styles.iconContainer}>
          <IconRenderer data={explorerIcon?.icon} fallback={fallbackIcon} />
        </div>
      </div>

      <div className={styles.itemMain}>
        <div className={styles.itemContent}>{rawName}</div>
        {postfix}
        <div
          className={styles.postfix}
          onClick={e => {
            // prevent jump to page
            e.preventDefault();
          }}
        >
          {inlineOperations.map(({ view, index }) => (
            <Fragment key={index}>{view}</Fragment>
          ))}
          {menuOperations.length > 0 && (
            <Menu
              items={menuOperations.map(({ view, index }) => (
                <Fragment key={index}>{view}</Fragment>
              ))}
            >
              <IconButton
                size="16"
                data-testid="navigation-panel-tree-node-operation-button"
                style={{ marginLeft: 4 }}
              >
                <MoreHorizontalIcon />
              </IconButton>
            </Menu>
          )}
        </div>
      </div>

      {renameable && renaming && (
        <NavigationPanelTreeNodeRenameModal
          setRenaming={setRenaming}
          handleRename={handleRename}
          rawName={rawName}
          explorerIconConfig={explorerIconConfig}
          fallbackIcon={fallbackIcon}
        />
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
      <ContextMenu
        asChild
        items={menuOperations.map(({ view, index }) => (
          <Fragment key={index}>{view}</Fragment>
        ))}
      >
        <div
          className={clsx(styles.contentContainer, styles.draggedOverEffect)}
          data-open={!collapsed}
          data-self-dragged-over={isSelfDraggedOver}
          ref={dropTargetRef}
        >
          {to ? (
            <LinkComponent
              to={to}
              className={styles.linkItemRoot}
              ref={dragRef}
              draggable={false}
            >
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
      </ContextMenu>
      <Collapsible.Content style={{ display: dragging ? 'none' : undefined }}>
        {/* For lastInGroup check, the placeholder must be placed above all children in the dom */}
        <div className={styles.collapseContentPlaceholder}>
          {childCount === 0 && !collapsed ? childrenPlaceholder : null}
        </div>
        <NavigationPanelTreeContext.Provider value={contextValue}>
          {collapsed ? null : children}
        </NavigationPanelTreeContext.Provider>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
