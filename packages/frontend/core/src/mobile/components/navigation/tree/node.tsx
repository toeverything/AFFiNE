import { MobileMenu } from '@affine/component';
import {
  type BaseNavigationPanelTreeNodeProps,
  NavigationPanelTreeContext,
} from '@affine/core/desktop/components/navigation-panel';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { extractEmojiIcon } from '@affine/core/utils';
import { ArrowDownSmallIcon, MoreHorizontalIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import {
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SwipeMenu } from '../../swipe-menu';
import * as styles from './node.css';

interface NavigationPanelTreeNodeProps extends BaseNavigationPanelTreeNodeProps {}

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
  operations = [],
  postfix,
  childrenOperations = [],
  childrenPlaceholder,
  linkComponent: LinkComponent = WorkbenchLink,
  ...otherProps
}: NavigationPanelTreeNodeProps) => {
  const context = useContext(NavigationPanelTreeContext);
  const level = context?.level ?? 0;
  // If no onClick or to is provided, clicking on the node will toggle the collapse state
  const clickForCollapse = !onClick && !to && !disabled;
  const [childCount, setChildCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
        {menuOperations.length > 0 ? (
          <div
            onClick={e => {
              // prevent jump to page
              e.preventDefault();
            }}
          >
            <MobileMenu
              items={menuOperations.map(({ view, index }) => (
                <Fragment key={index}>{view}</Fragment>
              ))}
            >
              <div className={styles.iconContainer} data-testid="menu-trigger">
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
    <Collapsible.Root
      open={!collapsed}
      onOpenChange={setCollapsed}
      style={assignInlineVars({
        [styles.levelIndent]: `${level * 20}px`,
      })}
      ref={rootRef}
      {...otherProps}
    >
      <SwipeMenu
        onExecute={useCallback(() => setMenuOpen(true), [])}
        menu={
          <MobileMenu
            rootOptions={useMemo(
              () => ({ open: menuOpen, onOpenChange: setMenuOpen }),
              [menuOpen]
            )}
            items={menuOperations.map(({ view, index }) => (
              <Fragment key={index}>{view}</Fragment>
            ))}
          >
            <MoreHorizontalIcon fontSize={24} />
          </MobileMenu>
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
      <Collapsible.Content>
        {/* For lastInGroup check, the placeholder must be placed above all children in the dom */}
        <div className={styles.collapseContentPlaceholder}>
          {childCount === 0 && !collapsed && childrenPlaceholder}
        </div>
        <NavigationPanelTreeContext.Provider value={contextValue}>
          {collapsed ? null : children}
        </NavigationPanelTreeContext.Provider>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
