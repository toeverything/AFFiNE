import {
  type BaseNavigationPanelTreeNodeProps,
  NavigationPanelTreeContext,
} from '@affine/core/desktop/components/navigation-panel';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { extractEmojiIcon } from '@affine/core/utils';
import { ArrowDownSmallIcon, MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import {
  type AriaAttributes,
  type AriaRole,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { SwipeMenu } from '../../swipe-menu';
import {
  MobileNavigationMenuItems,
  useMobileNavigationMenuHost,
} from '../menu-host';
import * as styles from './node.css';

interface NavigationPanelTreeNodeProps extends BaseNavigationPanelTreeNodeProps {
  menuTarget?: ReactNode;
  role?: AriaRole;
  'aria-label'?: string;
  'aria-level'?: number;
  'aria-expanded'?: AriaAttributes['aria-expanded'];
  'data-role'?: string;
}

const EMPTY_OPERATIONS: BaseNavigationPanelTreeNodeProps['operations'] = [];

export const NavigationPanelTreeNode = ({
  children,
  icon: Icon,
  name: rawName,
  onClick,
  to,
  active,
  disabled,
  collapsed,
  extractEmojiAsIcon,
  setCollapsed,
  operations = EMPTY_OPERATIONS,
  postfix,
  childrenOperations = EMPTY_OPERATIONS,
  childrenPlaceholder,
  menuTarget,
  linkComponent: LinkComponent = WorkbenchLink,
  ...otherProps
}: NavigationPanelTreeNodeProps) => {
  const context = useContext(NavigationPanelTreeContext);
  const level = context?.level ?? 0;
  // If no onClick or to is provided, clicking on the node will toggle the collapse state
  const clickForCollapse = !onClick && !to && !disabled;
  const [childCount, setChildCount] = useState(0);
  const menuHost = useMobileNavigationMenuHost();

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

  const { menuOperations } = useMemo(() => {
    const sorted = [...operations].sort((a, b) => a.index - b.index);
    return {
      menuOperations: sorted.filter(({ inline }) => !inline),
      inlineOperations: sorted.filter(({ inline }) => !!inline),
    };
  }, [operations]);
  const openMenu = useCallback(() => {
    if (menuTarget || menuOperations.length > 0) {
      menuHost.open(
        menuTarget ?? <MobileNavigationMenuItems operations={menuOperations} />
      );
    }
  }, [menuHost, menuOperations, menuTarget]);

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
        {menuTarget || menuOperations.length > 0 ? (
          <div
            onClick={e => {
              // prevent jump to page
              e.preventDefault();
              openMenu();
            }}
            className={styles.iconContainer}
            data-testid="menu-trigger"
          >
            {emoji ?? (Icon && <Icon collapsed={collapsed} />)}
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
        data-testid="navigation-panel-collapsed-button"
        className={styles.collapsedIconContainer}
      >
        <ArrowDownSmallIcon
          className={styles.collapsedIcon}
          data-collapsed={collapsed !== false}
        />
      </div>
    </div>
  );

  return (
    <div
      data-state={collapsed ? 'closed' : 'open'}
      style={assignInlineVars({
        [styles.levelIndent]: `${level * 20}px`,
      })}
      {...otherProps}
    >
      <SwipeMenu
        onExecute={openMenu}
        menu={
          <button
            type="button"
            onClick={openMenu}
            data-testid="swipe-menu-trigger"
          >
            <MoreHorizontalIcon fontSize={24} />
          </button>
        }
      >
        <div className={styles.contentContainer} data-open={!collapsed}>
          {to ? (
            <LinkComponent
              to={to}
              className={styles.linkItemRoot}
              draggable={false}
            >
              {content}
            </LinkComponent>
          ) : (
            <div>{content}</div>
          )}
        </div>
      </SwipeMenu>
      {collapsed ? null : (
        <div data-state="open">
          {/* For lastInGroup check, the placeholder must be placed above all children in the dom */}
          <div className={styles.collapseContentPlaceholder}>
            {childCount === 0 && childrenPlaceholder}
          </div>
          <NavigationPanelTreeContext.Provider value={contextValue}>
            {children}
          </NavigationPanelTreeContext.Provider>
        </div>
      )}
    </div>
  );
};
