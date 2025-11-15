import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import {
  ArrowDownSmallIcon,
  ArrowUpSmallIcon,
  ToggleDownIcon,
} from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import clsx from 'clsx';
import {
  createContext,
  forwardRef,
  type HTMLProps,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

import { Button } from '../button';
import { DropIndicator } from '../dnd';
import { Menu } from '../menu';
import * as styles from './property.css';

const PropertyTableContext = createContext<{
  mountProperty: (payload: { isHide: boolean }) => () => void;
  showAllHide: boolean;
} | null>(null);

export const PropertyCollapsibleSection = forwardRef<
  HTMLDivElement,
  PropsWithChildren<{
    defaultCollapsed?: boolean;
    icon?: ReactNode;
    title: ReactNode;
    suffix?: ReactNode;
    collapsed?: boolean;
    onCollapseChange?: (collapsed: boolean) => void;
  }> &
    Omit<HTMLProps<HTMLDivElement>, 'title'>
>(
  (
    {
      children,
      defaultCollapsed = false,
      collapsed,
      onCollapseChange,
      icon,
      title,
      suffix,
      className,
      ...props
    },
    ref
  ) => {
    const [internalCollapsed, setInternalCollapsed] =
      useState(defaultCollapsed);

    const handleCollapse = useCallback(
      (open: boolean) => {
        setInternalCollapsed(!open);
        onCollapseChange?.(!open);
      },
      [onCollapseChange]
    );

    const finalCollapsed =
      collapsed !== undefined ? collapsed : internalCollapsed;

    return (
      <Collapsible.Root
        {...props}
        ref={ref}
        className={clsx(styles.section, className)}
        open={!finalCollapsed}
        onOpenChange={handleCollapse}
        data-testid="property-collapsible-section"
      >
        <div
          className={styles.sectionHeader}
          data-testid="property-collapsible-section-header"
        >
          <Collapsible.Trigger
            role="button"
            data-testid="property-collapsible-section-trigger"
            className={styles.sectionHeaderTrigger}
          >
            {icon && <div className={styles.sectionHeaderIcon}>{icon}</div>}
            <div
              data-collapsed={finalCollapsed}
              className={styles.sectionHeaderName}
            >
              {title}
            </div>
            <ToggleDownIcon
              className={styles.sectionCollapsedIcon}
              data-collapsed={finalCollapsed}
            />
          </Collapsible.Trigger>
          {suffix}
        </div>
        <Collapsible.Content
          data-testid="property-collapsible-section-content"
          className={styles.sectionContent}
        >
          {children}
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }
);

PropertyCollapsibleSection.displayName = 'PropertyCollapsibleSection';

export const PropertyCollapsibleContent = forwardRef<
  HTMLDivElement,
  PropsWithChildren<{
    collapsible?: boolean;
    defaultCollapsed?: boolean;
    collapsed?: boolean;
    onCollapseChange?: (collapsed: boolean) => void;
    collapseButtonText?: (option: {
      total: number;
      hide: number;
      isCollapsed: boolean;
    }) => ReactNode;
  }> &
    HTMLProps<HTMLDivElement>
>(
  (
    {
      children,
      collapsible = true,
      collapsed,
      defaultCollapsed,
      onCollapseChange,
      collapseButtonText,
      className,
      ...props
    },
    ref
  ) => {
    const [propertyCount, setPropertyCount] = useState({ total: 0, hide: 0 });
    const [showAllHide, setShowAllHide] = useState(!defaultCollapsed);
    const finalCollapsible = collapsible ? propertyCount.hide !== 0 : false;
    const controlled = collapsed !== undefined;
    const finalShowAllHide = finalCollapsible
      ? !controlled
        ? showAllHide
        : !collapsed
      : true;

    const mountProperty = useCallback((payload: { isHide: boolean }) => {
      setPropertyCount(prev => ({
        total: prev.total + 1,
        hide: prev.hide + (payload.isHide ? 1 : 0),
      }));
      return () => {
        setPropertyCount(prev => ({
          total: prev.total - 1,
          hide: prev.hide - (payload.isHide ? 1 : 0),
        }));
      };
    }, []);

    const contextValue = useMemo(
      () => ({ mountProperty, showAllHide: finalShowAllHide }),
      [mountProperty, finalShowAllHide]
    );

    const handleShowAllHide = useCallback(() => {
      setShowAllHide(!finalShowAllHide);
      onCollapseChange?.(finalShowAllHide);
    }, [finalShowAllHide, onCollapseChange]);

    return (
      <div
        ref={ref}
        data-property-collapsible={finalCollapsible}
        data-property-collapsed={!finalShowAllHide}
        className={clsx(styles.propertyTableContent, className)}
        {...props}
      >
        <PropertyTableContext.Provider value={contextValue}>
          {children}
          {finalCollapsible && (
            <Button
              variant="plain"
              prefix={
                !finalShowAllHide ? (
                  <ArrowDownSmallIcon />
                ) : (
                  <ArrowUpSmallIcon />
                )
              }
              className={styles.tableButton}
              onClick={handleShowAllHide}
              data-testid="property-collapsible-button"
            >
              {collapseButtonText
                ? collapseButtonText({
                    total: propertyCount.total,
                    hide: propertyCount.hide,
                    isCollapsed: !finalShowAllHide,
                  })
                : !finalShowAllHide
                  ? 'Show All'
                  : 'Hide'}
            </Button>
          )}
        </PropertyTableContext.Provider>
      </div>
    );
  }
);

PropertyCollapsibleContent.displayName = 'PropertyCollapsible';

const PropertyRootContext = createContext<{
  mountValue: (payload: { isEmpty: boolean }) => () => void;
} | null>(null);

export const PropertyRoot = forwardRef<
  HTMLDivElement,
  {
    dropIndicatorEdge?: Edge | null;
    hideEmpty?: boolean;
    hide?: boolean;
  } & HTMLProps<HTMLDivElement>
>(
  (
    { children, className, dropIndicatorEdge, hideEmpty, hide, ...props },
    ref
  ) => {
    const [isEmpty, setIsEmpty] = useState(false);
    const context = useContext(PropertyTableContext);

    const preferHide = hide || (hideEmpty && isEmpty);
    const showAllHide = context?.showAllHide;
    const shouldHide = preferHide && !showAllHide;

    useLayoutEffect(() => {
      if (context) {
        return context.mountProperty({ isHide: !!preferHide });
      }
      return;
    }, [context, preferHide]);

    const contextValue = useMemo(
      () => ({
        mountValue: (payload: { isEmpty: boolean }) => {
          setIsEmpty(payload.isEmpty);
          return () => {
            setIsEmpty(false);
          };
        },
      }),
      [setIsEmpty]
    );

    return (
      <PropertyRootContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={clsx(
            styles.propertyRoot,
            shouldHide && styles.hide,
            className
          )}
          {...props}
        >
          {children}
          <DropIndicator edge={dropIndicatorEdge} />
        </div>
      </PropertyRootContext.Provider>
    );
  }
);
PropertyRoot.displayName = 'PropertyRoot';

export const PropertyName = ({
  icon,
  name,
  className,
  menuItems,
  defaultOpenMenu,
  ...props
}: {
  icon?: ReactNode;
  name?: ReactNode;
  menuItems?: ReactNode;
  defaultOpenMenu?: boolean;
} & Omit<HTMLProps<HTMLDivElement>, 'name'>) => {
  const [menuOpen, setMenuOpen] = useState(defaultOpenMenu);
  const hasMenu = !!menuItems;

  const handleClick = useCallback(() => {
    if (!hasMenu) return;
    setMenuOpen(true);
  }, [hasMenu]);

  const handleMenuClose = useCallback((open: boolean) => {
    if (!open) {
      setMenuOpen(false);
    }
  }, []);

  const content = (
    <div
      className={clsx(styles.propertyNameContainer, className)}
      data-has-menu={hasMenu}
      onClick={handleClick}
      {...props}
    >
      <div className={styles.propertyNameInnerContainer}>
        {icon && <div className={styles.propertyIconContainer}>{icon}</div>}
        <div className={styles.propertyNameContent}>{name}</div>
      </div>
    </div>
  );

  if (menuOpen && menuItems) {
    // Do not mount <Menu /> when menuOpen is false, as <Menu /> will cause draggable to not work
    return (
      <Menu
        items={menuItems}
        rootOptions={{
          open: true,
          modal: true, // false will case bug
          onOpenChange: handleMenuClose,
        }}
      >
        {content}
      </Menu>
    );
  }
  return content;
};

export const PropertyValue = forwardRef<
  HTMLDivElement,
  {
    readonly?: boolean;
    isEmpty?: boolean;
    hoverable?: boolean;
  } & HTMLProps<HTMLDivElement>
>(
  (
    { children, className, readonly, isEmpty, hoverable = true, ...props },
    ref
  ) => {
    const context = useContext(PropertyRootContext);

    useLayoutEffect(() => {
      if (context) {
        return context.mountValue({ isEmpty: !!isEmpty });
      }
      return;
    }, [context, isEmpty]);

    return (
      <div
        ref={ref}
        className={clsx(styles.propertyValueContainer, className)}
        data-readonly={readonly ? 'true' : 'false'}
        data-empty={isEmpty ? 'true' : 'false'}
        data-hoverable={
          hoverable && !BUILD_CONFIG.isMobileEdition ? 'true' : 'false'
        }
        data-property-value
        {...props}
      >
        {children}
      </div>
    );
  }
);
PropertyValue.displayName = 'PropertyValue';
