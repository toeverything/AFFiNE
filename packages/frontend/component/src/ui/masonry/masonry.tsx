import clsx from 'clsx';
import { debounce } from 'lodash-es';
import throttle from 'lodash-es/throttle';
import {
  forwardRef,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
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

  gapX?: number;
  gapY?: number;
  paddingX?: MasonryPX;
  paddingY?: number;

  groupsGap?: number;
  groupHeaderGapWithItems?: number;
  stickyGroupHeader?: boolean;
  collapsedGroups?: string[];
  onGroupCollapse?: (groupId: string, collapsed: boolean) => void;
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

  onStickyGroupChange?: (groupId?: string) => void;
}

export type MasonryRef = {
  scrollToGroup: (groupId: string) => void;
};

export const Masonry = forwardRef<MasonryRef, MasonryProps>(function Masonry(
  {
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
    collapsedGroups,
    columns,
    preloadHeight = 50,
    resizeDebounce = 20,
    onGroupCollapse,
    onStickyGroupChange,
    ...props
  },
  ref
) {
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
  const stickyGroupCollapsed = !!(
    collapsedGroups &&
    stickyGroupId &&
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
    if (!stickyGroupId) return undefined;
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
    groups,
    groupsGap,
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
          const stickyGroupId = calcSticky({ scrollY, layoutMap });
          setStickyGroupId(stickyGroupId);
          onStickyGroupChange?.(stickyGroupId);
        }
      }, 50);
      rootEl.addEventListener('scroll', handler);
      return () => {
        rootEl.removeEventListener('scroll', handler);
      };
    }
    return;
  }, [
    layoutMap,
    onStickyGroupChange,
    stickyGroupHeader,
    updateActiveMap,
    virtualScroll,
  ]);

  const scrollToGroup = useCallback(
    (groupId: string) => {
      const group = layoutMap.get(groupId);
      if (!group) return;
      rootRef.current?.scrollTo({
        top: group.y,
        behavior: 'instant',
      });
    },
    [layoutMap]
  );

  useImperativeHandle<MasonryRef, MasonryRef>(ref, () => {
    return { scrollToGroup };
  });

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
          const {
            id: groupId,
            items,
            className,
            Component,
            ...groupProps
          } = group;
          const collapsed =
            collapsedGroups && collapsedGroups.includes(groupId);

          return (
            <Fragment key={groupId}>
              {/* group header */}
              {virtualScroll && !activeMap.get(group.id) ? null : (
                <MasonryGroupHeader
                  className={clsx(styles.groupHeader, className)}
                  key={`header-${groupId}`}
                  id={groupId}
                  locateMode={locateMode}
                  xywh={layoutMap.get(groupId)}
                  {...groupProps}
                  onClick={() => onGroupCollapse?.(groupId, !collapsed)}
                  Component={Component}
                  itemCount={items.length}
                  collapsed={!!collapsed}
                  groupId={groupId}
                  paddingX={calcPX(paddingX, totalWidth)}
                />
              )}
              {/* group items */}
              {collapsed
                ? null
                : items.map(({ id: itemId, Component, ...item }) => {
                    const mixId = groupId ? `${groupId}:${itemId}` : itemId;
                    if (virtualScroll && !activeMap.get(mixId)) return null;
                    return (
                      <MasonryGroupItem
                        key={mixId}
                        id={mixId}
                        {...item}
                        locateMode={locateMode}
                        xywh={layoutMap.get(mixId)}
                        groupId={groupId}
                        itemId={itemId}
                        Component={Component}
                      />
                    );
                  })}
            </Fragment>
          );
        })}
        <div data-masonry-placeholder style={{ height }} />
      </Scrollable.Viewport>
      {stickyGroup ? (
        <div
          className={clsx(styles.stickyGroupHeader, stickyGroup.className)}
          style={{
            padding: `0 ${calcPX(paddingX, totalWidth)}px`,
            height: stickyGroup.height,
            ...stickyGroup.style,
          }}
          onClick={() =>
            onGroupCollapse?.(stickyGroup.id, !stickyGroupCollapsed)
          }
        >
          {stickyGroup.Component ? (
            <stickyGroup.Component
              groupId={stickyGroup.id}
              itemCount={stickyGroup.items.length}
              collapsed={stickyGroupCollapsed}
            />
          ) : (
            stickyGroup.children
          )}
        </div>
      ) : null}
      <Scrollable.Scrollbar className={styles.scrollbar} />
    </Scrollable.Root>
  );
});

type MasonryItemProps = MasonryItem &
  Omit<React.HTMLAttributes<HTMLDivElement>, 'id' | 'height'> & {
    locateMode?: 'transform' | 'leftTop' | 'transform3d';
    xywh?: MasonryItemXYWH;
  };

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
  ...props
}: Omit<MasonryItemProps, 'Component'> & {
  Component?: MasonryGroup['Component'];
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
        />
      );
    }
    return children;
  }, [Component, children, collapsed, groupId, itemCount]);

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
}: Omit<MasonryItemProps, 'height' | 'ratio'>) {
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
