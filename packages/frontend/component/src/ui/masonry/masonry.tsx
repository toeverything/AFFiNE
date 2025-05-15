import clsx from 'clsx';
import { debounce } from 'lodash-es';
import throttle from 'lodash-es/throttle';
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { observeResize } from '../../utils';
import { Scrollable } from '../scrollbar';
import * as styles from './styles.css';
import type {
  MasonryGroup,
  MasonryItem,
  MasonryItemXYWH,
  MasonryPX,
} from './type';
import {
  calcActive,
  calcColumns,
  calcLayout,
  calcPX,
  calcSticky,
} from './utils';

export interface MasonryProps extends React.HTMLAttributes<HTMLDivElement> {
  items: MasonryItem[] | MasonryGroup[];

  itemComponent: React.ComponentType<{
    groupId: string;
    itemId: string;
  }>;
  groupComponent?: React.ComponentType<{
    groupId: string;
    itemCount: number;
    collapsed: boolean;
    onCollapse: (collapsed: boolean) => void;
  }>;

  groupHeight?: number | ((group: MasonryGroup) => number);
  itemHeight: number | ((item: MasonryItem) => number);

  groupClassName?: string;
  itemClassName?: string;

  gapX?: number;
  gapY?: number;
  paddingX?: MasonryPX;
  paddingY?: number;

  groupsGap?: number;
  groupHeaderGapWithItems?: number;
  stickyGroupHeader?: boolean;

  /**
   * Specify the width of the item.
   * - `number`: The width of the item in pixels.
   * - `'stretch'`: The item will stretch to fill the container.
   * @default 'stretch'
   */
  itemWidth?: number | 'stretch';
  /**
   * The minimum width of the item in pixels.
   * @default 100
   */
  itemWidthMin?: number;
  virtualScroll?: boolean;
  locateMode?: 'transform' | 'leftTop' | 'transform3d';
  /**
   * Specify the number of columns, will override the calculated
   */
  columns?: number;
  resizeDebounce?: number;
  preloadHeight?: number;

  itemSelected?: string[];
  onItemSelectedChanged?: (selected: string[]) => void;
}

export const Masonry = ({
  items,
  gapX = 12,
  gapY = 12,
  itemWidth = 'stretch',
  itemWidthMin = 100,
  paddingX = 0,
  paddingY = 0,
  className,
  virtualScroll = false,
  locateMode = 'leftTop',
  groupsGap = 0,
  groupHeaderGapWithItems = 0,
  stickyGroupHeader = true,
  columns,
  preloadHeight = 50,
  resizeDebounce = 20,
  groupComponent: GroupComponent,
  itemComponent: ItemComponent,
  groupClassName,
  itemClassName,
  itemHeight,
  groupHeight,
  ...props
}: MasonryProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [layoutMap, setLayoutMap] = useState<
    Map<MasonryItem['id'], MasonryItemXYWH>
  >(new Map());
  /**
   * Record active items, to ensure all items won't be rendered when initialized.
   */
  const [activeMap, setActiveMap] = useState<Map<MasonryItem['id'], boolean>>(
    new Map()
  );
  const [stickyGroupId, setStickyGroupId] = useState<string | undefined>(
    undefined
  );
  const [totalWidth, setTotalWidth] = useState(0);

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const onGroupCollapse = useCallback((groupId: string, collapsed: boolean) => {
    setCollapsedGroups(prev =>
      collapsed ? [...prev, groupId] : prev.filter(id => id !== groupId)
    );
  }, []);

  const stickyGroupCollapsed = !!(
    collapsedGroups &&
    stickyGroupId !== undefined &&
    collapsedGroups.includes(stickyGroupId)
  );

  const groups = useMemo(() => {
    if (items.length === 0) {
      return [];
    }
    if (items[0] && 'items' in items[0]) return items as MasonryGroup[];
    return [{ id: '', height: 0, items: items as MasonryItem[] }];
  }, [items]);

  const stickyGroup = useMemo(() => {
    if (stickyGroupId === undefined) return undefined;
    return groups.find(group => group.id === stickyGroupId);
  }, [groups, stickyGroupId]);

  const updateActiveMap = useCallback(
    (layoutMap: Map<MasonryItem['id'], MasonryItemXYWH>, _scrollY?: number) => {
      if (!virtualScroll) return;

      const rootEl = rootRef.current;
      if (!rootEl) return;

      requestAnimationFrame(() => {
        const scrollY = _scrollY ?? rootEl.scrollTop;
        const activeMap = calcActive({
          viewportHeight: rootEl.clientHeight,
          scrollY,
          layoutMap,
          preloadHeight,
        });
        setActiveMap(activeMap);
      });
    },
    [preloadHeight, virtualScroll]
  );

  const calculateLayout = useCallback(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    const totalWidth = rootEl.clientWidth;
    const { columns: calculatedColumns, width } = calcColumns(
      totalWidth,
      itemWidth,
      itemWidthMin,
      gapX,
      paddingX,
      columns
    );

    const { layout, height } = calcLayout(groups, {
      totalWidth,
      columns: calculatedColumns,
      width,
      gapX,
      gapY,
      paddingX,
      paddingY,
      groupsGap,
      groupHeaderGapWithItems,
      collapsedGroups: collapsedGroups ?? [],
      groupHeight: groupHeight ?? 0,
      itemHeight,
    });
    setLayoutMap(layout);
    setHeight(height);
    setTotalWidth(totalWidth);
    updateActiveMap(layout);
    if (stickyGroupHeader && rootRef.current) {
      setStickyGroupId(
        calcSticky({ scrollY: rootRef.current.scrollTop, layoutMap: layout })
      );
    }
  }, [
    collapsedGroups,
    columns,
    gapX,
    gapY,
    groupHeaderGapWithItems,
    groupHeight,
    groups,
    groupsGap,
    itemHeight,
    itemWidth,
    itemWidthMin,
    paddingX,
    paddingY,
    stickyGroupHeader,
    updateActiveMap,
  ]);

  // handle resize
  useEffect(() => {
    calculateLayout();
    if (rootRef.current) {
      return observeResize(
        rootRef.current,
        debounce(calculateLayout, resizeDebounce)
      );
    }
    return;
  }, [calculateLayout, resizeDebounce]);

  // handle scroll
  useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    if (virtualScroll) {
      const handler = throttle((e: Event) => {
        const scrollY = (e.target as HTMLElement).scrollTop;
        updateActiveMap(layoutMap, scrollY);
        if (stickyGroupHeader) {
          setStickyGroupId(calcSticky({ scrollY, layoutMap }));
        }
      }, 50);
      rootEl.addEventListener('scroll', handler);
      return () => {
        rootEl.removeEventListener('scroll', handler);
      };
    }
    return;
  }, [layoutMap, stickyGroupHeader, updateActiveMap, virtualScroll]);

  return (
    <Scrollable.Root>
      <Scrollable.Viewport
        ref={rootRef}
        data-masonry-root
        className={clsx('scrollable', styles.root, className)}
        {...props}
      >
        {groups.map(group => {
          // sleep is not calculated, do not render
          const { id: groupId, items, ...groupProps } = group;
          const collapsed =
            collapsedGroups && collapsedGroups.includes(groupId);

          return (
            <Fragment key={groupId}>
              {/* group header */}
              {virtualScroll && !activeMap.get(group.id) ? null : (
                <MasonryGroupHeader
                  className={clsx(styles.groupHeader, groupClassName)}
                  key={`header-${groupId}`}
                  id={groupId}
                  locateMode={locateMode}
                  xywh={layoutMap.get(groupId)}
                  {...groupProps}
                  onCollapse={collapsed =>
                    onGroupCollapse?.(groupId, collapsed)
                  }
                  Component={GroupComponent}
                  itemCount={items.length}
                  collapsed={!!collapsed}
                  groupId={groupId}
                  paddingX={calcPX(paddingX, totalWidth)}
                />
              )}
              {/* group items */}
              {collapsed
                ? null
                : items.map(item => {
                    const itemId = item.id;
                    const mixId = groupId ? `${groupId}:${itemId}` : itemId;
                    if (virtualScroll && !activeMap.get(mixId)) return null;
                    return (
                      <MasonryGroupItem
                        key={mixId}
                        id={mixId}
                        locateMode={locateMode}
                        xywh={layoutMap.get(mixId)}
                        groupId={groupId}
                        itemId={itemId}
                        className={itemClassName}
                        Component={ItemComponent}
                      />
                    );
                  })}
            </Fragment>
          );
        })}
        <div data-masonry-placeholder style={{ height }} />
      </Scrollable.Viewport>
      <Scrollable.Scrollbar />
      {stickyGroup ? (
        <div
          className={clsx(styles.stickyGroupHeader, groupClassName)}
          style={{
            padding: `0 ${calcPX(paddingX, totalWidth)}px`,
            height:
              typeof groupHeight === 'function'
                ? groupHeight(stickyGroup)
                : groupHeight,
          }}
        >
          {GroupComponent && (
            <GroupComponent
              groupId={stickyGroup.id}
              itemCount={stickyGroup.items.length}
              collapsed={stickyGroupCollapsed}
              onCollapse={collapsed => {
                onGroupCollapse(stickyGroup.id, collapsed);
              }}
            />
          )}
        </div>
      ) : null}
    </Scrollable.Root>
  );
};

interface MasonryItemProps
  extends MasonryItem,
    Omit<React.HTMLAttributes<HTMLDivElement>, 'id' | 'height'> {
  locateMode?: 'transform' | 'leftTop' | 'transform3d';
  xywh?: MasonryItemXYWH;
}

const MasonryGroupHeader = memo(function MasonryGroupHeader({
  id,
  children,
  style,
  className,
  Component,
  groupId,
  itemCount,
  collapsed,
  paddingX,
  onCollapse,
  ...props
}: Omit<MasonryItemProps, 'Component'> & {
  Component?: MasonryProps['groupComponent'];
  onCollapse: (collapsed: boolean) => void;
  groupId: string;
  itemCount: number;
  collapsed: boolean;
  paddingX?: number;
}) {
  const content = useMemo(() => {
    if (Component) {
      return (
        <Component
          groupId={groupId}
          itemCount={itemCount}
          collapsed={collapsed}
          onCollapse={onCollapse}
        />
      );
    }
    return children;
  }, [Component, children, collapsed, groupId, itemCount, onCollapse]);

  return (
    <MasonryItem
      id={id}
      style={{
        padding: `0 ${paddingX}px`,
        height: '100%',
        ...style,
      }}
      className={className}
      {...props}
    >
      {content}
    </MasonryItem>
  );
});

const MasonryGroupItem = memo(function MasonryGroupItem({
  id,
  children,
  className,
  Component,
  groupId,
  itemId,
  ...props
}: MasonryItemProps & {
  groupId: string;
  itemId: string;
  Component?: MasonryProps['itemComponent'];
}) {
  const content = useMemo(() => {
    if (Component) {
      return <Component groupId={groupId} itemId={itemId} />;
    }
    return children;
  }, [Component, children, groupId, itemId]);

  return (
    <MasonryItem id={id} className={className} {...props}>
      {content}
    </MasonryItem>
  );
});

const MasonryItem = memo(function MasonryItem({
  id,
  xywh,
  locateMode = 'leftTop',
  children,
  className,
  style: styleProp,
  ...props
}: MasonryItemProps) {
  const style = useMemo(() => {
    if (!xywh) return { display: 'none' };

    const { x, y, w, h } = xywh;

    const posStyle =
      locateMode === 'transform'
        ? { transform: `translate(${x}px, ${y}px)` }
        : locateMode === 'leftTop'
          ? { left: `${x}px`, top: `${y}px` }
          : { transform: `translate3d(${x}px, ${y}px, 0)` };

    return {
      left: 0,
      top: 0,
      ...styleProp,
      ...posStyle,
      width: `${w}px`,
      height: `${h}px`,
    };
  }, [locateMode, styleProp, xywh]);

  if (!xywh) return null;

  return (
    <div
      data-masonry-item
      data-masonry-item-id={id}
      style={style}
      className={clsx(styles.item, className)}
      {...props}
    >
      {children}
    </div>
  );
});
