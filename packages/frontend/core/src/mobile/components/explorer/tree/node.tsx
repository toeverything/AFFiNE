import { MenuItem, MobileMenu } from '@affine/component';
import { RenameModal } from '@affine/component/rename-modal';
import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import type {
  BaseExplorerTreeNodeProps,
  NodeOperation,
} from '@affine/core/modules/explorer';
import { ExplorerTreeContext } from '@affine/core/modules/explorer';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { extractEmojiIcon } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { ArrowDownSmallIcon, EditIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import {
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './node.css';

interface ExplorerTreeNodeProps extends BaseExplorerTreeNodeProps {}

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
  operations = [],
  postfix,
  childrenOperations = [],
  childrenPlaceholder,
  linkComponent: LinkComponent = WorkbenchLink,
  ...otherProps
}: ExplorerTreeNodeProps) => {
  const t = useI18n();
  const context = useContext(ExplorerTreeContext);
  const level = context?.level ?? 0;
  // If no onClick or to is provided, clicking on the node will toggle the collapse state
  const clickForCollapse = !onClick && !to && !disabled;
  const [childCount, setChildCount] = useState(0);
  const [renaming, setRenaming] = useState(defaultRenaming);
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

  const { menuOperations } = useMemo(() => {
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
    (newName: string) => onRename?.(newName),
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
      <div className={styles.itemMain}>
        {menuOperations.length > 0 ? (
          <div
            onClick={e => {
              // prevent jump to page
              e.preventDefault();
            }}
          >
            <MobileMenu
              items={menuOperations.map(({ view }, index) => (
                <Fragment key={index}>{view}</Fragment>
              ))}
            >
              <div className={styles.iconContainer}>
                {emoji ?? (Icon && <Icon collapsed={collapsed} />)}
              </div>
            </MobileMenu>
          </div>
        ) : (
          <div className={styles.iconContainer}>
            {emoji ?? (Icon && <Icon collapsed={collapsed} />)}
          </div>
        )}

        <div className={styles.itemContent}>{name}</div>

        {postfix}
      </div>

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
      <div className={styles.contentContainer} data-open={!collapsed}>
        {to ? (
          <LinkComponent to={to} className={styles.linkItemRoot}>
            {content}
          </LinkComponent>
        ) : (
          <div>{content}</div>
        )}
      </div>
      <Collapsible.Content>
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
