import { Scrollable } from '@affine/component';
import clsx from 'clsx';
import { selectAtom } from 'jotai/utils';
import {
  forwardRef,
  type HTMLAttributes,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { Virtuoso } from 'react-virtuoso';

import { ListInnerWrapper } from './list';
import * as styles from './list.css';
import { ItemGroupHeader } from './page-group';
import {
  groupCollapseStateAtom,
  groupsAtom,
  listPropsAtom,
  ListProvider,
  useAtomValue,
} from './scoped-atoms';
import type {
  ItemGroupProps,
  ItemListHandle,
  ListItem,
  VirtualizedListProps,
} from './types';

// we have three item types for rendering rows in Virtuoso
type VirtuosoItemType =
  | 'sticky-header'
  | 'group-header'
  | 'item'
  | 'item-spacer';

interface BaseVirtuosoItem {
  type: VirtuosoItemType;
}

interface VirtuosoItemStickyHeader<T> extends BaseVirtuosoItem {
  type: 'sticky-header';
  data?: T;
}

interface VirtuosoItemItem<T> extends BaseVirtuosoItem {
  type: 'item';
  data: T;
}

interface VirtuosoItemGroupHeader<T> extends BaseVirtuosoItem {
  type: 'group-header';
  data: ItemGroupProps<T>;
}

interface VirtuosoPageItemSpacer extends BaseVirtuosoItem {
  type: 'item-spacer';
  data: {
    height: number;
  };
}

type VirtuosoItem<T> =
  | VirtuosoItemStickyHeader<T>
  | VirtuosoItemItem<T>
  | VirtuosoItemGroupHeader<T>
  | VirtuosoPageItemSpacer;

/**
 * Given a list of pages, render a list of pages
 * Similar to normal PageList, but uses react-virtuoso to render the list (virtual rendering)
 */
export const VirtualizedList = forwardRef<
  ItemListHandle,
  VirtualizedListProps<ListItem>
>(function VirtualizedList(props, ref) {
  return (
    // push pageListProps to the atom so that downstream components can consume it
    // this makes sure pageListPropsAtom is always populated
    <ListProvider initialValues={[[listPropsAtom, props]]}>
      <ListInnerWrapper {...props} handleRef={ref}>
        <ListInner {...props} />
      </ListInnerWrapper>
    </ListProvider>
  );
});

const headingAtom = selectAtom(listPropsAtom, props => props.heading);

const PageListHeading = () => {
  const heading = useAtomValue(headingAtom);
  return <div className={styles.heading}>{heading}</div>;
};

const useVirtuosoItems = <T extends ListItem>() => {
  const groups = useAtomValue(groupsAtom);
  const groupCollapsedState = useAtomValue(groupCollapseStateAtom);

  return useMemo(() => {
    const items: VirtuosoItem<T>[] = [];

    // 1.
    // always put sticky header at the top
    // the visibility of sticky header is inside of PageListTableHeader
    items.push({
      type: 'sticky-header',
    });

    // 2.
    // iterate groups and add page items
    for (const group of groups) {
      // skip empty group header since it will cause issue in virtuoso ("Zero-sized element")
      if (group.label) {
        items.push({
          type: 'group-header',
          data: group as ItemGroupProps<T>,
        });
      }
      // do not render items if the group is collapsed
      if (!groupCollapsedState[group.id]) {
        for (const item of group.items) {
          items.push({
            type: 'item',
            data: item as T,
          });
          // add a spacer between items (4px), unless it's the last item
          if (item !== group.items[group.items.length - 1]) {
            items.push({
              type: 'item-spacer',
              data: {
                height: 4,
              },
            });
          }
        }
      }

      // add a spacer between groups (16px)
      items.push({
        type: 'item-spacer',
        data: {
          height: 16,
        },
      });
    }
    return items;
  }, [groupCollapsedState, groups]);
};

const Scroller = forwardRef<
  HTMLDivElement,
  PropsWithChildren<HTMLAttributes<HTMLDivElement>>
>(({ children, ...props }, ref) => {
  return (
    <Scrollable.Root>
      <Scrollable.Viewport {...props} ref={ref}>
        {children}
      </Scrollable.Viewport>
      <Scrollable.Scrollbar />
    </Scrollable.Root>
  );
});

Scroller.displayName = 'Scroller';

const ListInner = ({
  atTopStateChange,
  atTopThreshold,
  ...props
}: VirtualizedListProps<ListItem>) => {
  const virtuosoItems = useVirtuosoItems<ListItem>();
  const [atTop, setAtTop] = useState(false);
  const handleAtTopStateChange = useCallback(
    (atTop: boolean) => {
      setAtTop(atTop);
      atTopStateChange?.(atTop);
    },
    [atTopStateChange]
  );
  const components = useMemo(() => {
    return {
      Header: props.heading ? PageListHeading : undefined,
      Scroller: Scroller,
    };
  }, [props.heading]);
  const itemContentRenderer = useCallback(
    (_index: number, data: VirtuosoItem<ListItem>) => {
      switch (data.type) {
        case 'sticky-header':
          return props.headerRenderer?.(data.data);
        case 'group-header':
          return <ItemGroupHeader {...data.data} />;
        case 'item':
          return props.itemRenderer?.(data.data);
        case 'item-spacer':
          return <div style={{ height: data.data.height }} />;
      }
    },
    [props]
  );
  return (
    <Virtuoso<VirtuosoItem<ListItem>>
      data-has-scroll-top={!atTop}
      atTopThreshold={atTopThreshold ?? 0}
      atTopStateChange={handleAtTopStateChange}
      components={components}
      data={virtuosoItems}
      data-testid="virtualized-page-list"
      data-total-count={props.items.length} // for testing, since we do not know the total count in test
      topItemCount={1} // sticky header
      totalCount={virtuosoItems.length}
      itemContent={itemContentRenderer}
      className={clsx(props.className, styles.root)}
      // todo: set a reasonable overscan value to avoid blank space?
      // overscan={100}
    />
  );
};
