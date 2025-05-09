import clsx from 'clsx';
import throttle from 'lodash-es/throttle';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { observeResize } from '../../utils';
import { Scrollable } from '../scrollbar';
import * as styles from './styles.css';
import type { MasonryItem, MasonryItemXYWH } from './type';
import { calcColumns, calcLayout, calcSleep } from './utils';

export interface MasonryProps extends React.HTMLAttributes<HTMLDivElement> {
  items: MasonryItem[];

  gapX?: number;
  gapY?: number;
  paddingX?: number;
  paddingY?: number;
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
  ...props
}: MasonryProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [layoutMap, setLayoutMap] = useState<
    Map<MasonryItem['id'], MasonryItemXYWH>
  >(new Map());
  const [sleepMap, setSleepMap] = useState<Map<MasonryItem['id'], boolean>>(
    new Map()
  );

  const updateSleepMap = useCallback(
    (layoutMap: Map<MasonryItem['id'], MasonryItemXYWH>, _scrollY?: number) => {
      if (!virtualScroll) return;

      const rootEl = rootRef.current;
      if (!rootEl) return;

      requestAnimationFrame(() => {
        const scrollY = _scrollY ?? rootEl.scrollTop;
        const sleepMap = calcSleep({
          viewportHeight: rootEl.clientHeight,
          scrollY,
          layoutMap,
          preloadHeight: 50,
        });
        setSleepMap(sleepMap);
      });
    },
    [virtualScroll]
  );

  const calculateLayout = useCallback(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    const totalWidth = rootEl.clientWidth;
    const { columns, width } = calcColumns(
      totalWidth,
      itemWidth,
      itemWidthMin,
      gapX,
      paddingX
    );

    const { layout, height } = calcLayout(items, {
      columns,
      width,
      gapX,
      gapY,
      paddingX,
      paddingY,
    });
    setLayoutMap(layout);
    setHeight(height);
    updateSleepMap(layout);
  }, [
    gapX,
    gapY,
    itemWidth,
    itemWidthMin,
    items,
    paddingX,
    paddingY,
    updateSleepMap,
  ]);

  // handle resize
  useEffect(() => {
    calculateLayout();
    if (rootRef.current) {
      return observeResize(rootRef.current, calculateLayout);
    }
    return;
  }, [calculateLayout]);

  // handle scroll
  useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    if (virtualScroll) {
      const handler = throttle((e: Event) => {
        const scrollY = (e.target as HTMLElement).scrollTop;
        updateSleepMap(layoutMap, scrollY);
      }, 50);
      rootEl.addEventListener('scroll', handler);
      return () => {
        rootEl.removeEventListener('scroll', handler);
      };
    }
    return;
  }, [layoutMap, updateSleepMap, virtualScroll]);

  return (
    <Scrollable.Root>
      <Scrollable.Viewport
        ref={rootRef}
        data-masonry-root
        className={clsx('scrollable', styles.root, className)}
        {...props}
      >
        {items.map(item => {
          return (
            <MasonryItem
              key={item.id}
              {...item}
              locateMode={locateMode}
              xywh={layoutMap.get(item.id)}
              sleep={sleepMap.get(item.id)}
            >
              {item.children}
            </MasonryItem>
          );
        })}
        <div data-masonry-placeholder style={{ height }} />
      </Scrollable.Viewport>
      <Scrollable.Scrollbar />
    </Scrollable.Root>
  );
};

interface MasonryItemProps
  extends MasonryItem,
    Omit<React.HTMLAttributes<HTMLDivElement>, 'id' | 'height'> {
  locateMode?: 'transform' | 'leftTop' | 'transform3d';
  sleep?: boolean;
  xywh?: MasonryItemXYWH;
}

const MasonryItem = memo(function MasonryItem({
  id,
  xywh,
  locateMode = 'leftTop',
  sleep = false,
  className,
  children,
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

  if (sleep || !xywh) return null;

  return (
    <div
      data-masonry-item
      data-masonry-item-id={id}
      className={clsx(styles.item, className)}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
});
