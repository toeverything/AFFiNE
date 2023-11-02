import type { PageMeta } from '@blocksuite/store';
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

import { Scrollable } from '../../ui/scrollbar';
import { PageGroupHeader, PageMetaListItemRenderer } from './page-group';
import { PageListTableHeader } from './page-header';
import { PageListInnerWrapper } from './page-list';
import * as styles from './page-list.css';
import {
  pageGroupCollapseStateAtom,
  pageGroupsAtom,
  pageListPropsAtom,
  PageListProvider,
  useAtomValue,
} from './scoped-atoms';
import type {
  PageGroupProps,
  PageListHandle,
  VirtualizedPageListProps,
} from './types';

// we have three item types for rendering rows in Virtuoso
type VirtuosoItemType =
  | 'sticky-header'
  | 'page-group-header'
  | 'page-item'
  | 'page-item-spacer';

interface BaseVirtuosoItem {
  type: VirtuosoItemType;
}

interface VirtuosoItemStickyHeader extends BaseVirtuosoItem {
  type: 'sticky-header';
}

interface VirtuosoItemPageItem extends BaseVirtuosoItem {
  type: 'page-item';
  data: PageMeta;
}

interface VirtuosoItemPageGroupHeader extends BaseVirtuosoItem {
  type: 'page-group-header';
  data: PageGroupProps;
}

interface VirtuosoPageItemSpacer extends BaseVirtuosoItem {
  type: 'page-item-spacer';
  data: {
    height: number;
  };
}

type VirtuosoItem =
  | VirtuosoItemStickyHeader
  | VirtuosoItemPageItem
  | VirtuosoItemPageGroupHeader
  | VirtuosoPageItemSpacer;

/**
 * Given a list of pages, render a list of pages
 * Similar to normal PageList, but uses react-virtuoso to render the list (virtual rendering)
 */
export const VirtualizedPageList = forwardRef<
  PageListHandle,
  VirtualizedPageListProps
>(function VirtualizedPageList(props, ref) {
  return (
    // push pageListProps to the atom so that downstream components can consume it
    // this makes sure pageListPropsAtom is always populated
    // @ts-expect-error fix type issues later
    <PageListProvider initialValues={[[pageListPropsAtom, props]]}>
      <PageListInnerWrapper {...props} handleRef={ref}>
        <PageListInner {...props} />
      </PageListInnerWrapper>
    </PageListProvider>
  );
});

const headingAtom = selectAtom(pageListPropsAtom, props => props.heading);

const PageListHeading = () => {
  const heading = useAtomValue(headingAtom);
  return <div className={styles.heading}>{heading}</div>;
};

const useVirtuosoItems = () => {
  const groups = useAtomValue(pageGroupsAtom);
  const groupCollapsedState = useAtomValue(pageGroupCollapseStateAtom);

  return useMemo(() => {
    const items: VirtuosoItem[] = [];

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
          type: 'page-group-header',
          data: group,
        });
      }
      // do not render items if the group is collapsed
      if (!groupCollapsedState[group.id]) {
        for (const item of group.items) {
          items.push({
            type: 'page-item',
            data: item,
          });
          // add a spacer between items (4px), unless it's the last item
          if (item !== group.items[group.items.length - 1]) {
            items.push({
              type: 'page-item-spacer',
              data: {
                height: 4,
              },
            });
          }
        }
      }

      // add a spacer between groups (16px)
      items.push({
        type: 'page-item-spacer',
        data: {
          height: 16,
        },
      });
    }
    return items;
  }, [groupCollapsedState, groups]);
};

const itemContentRenderer = (_index: number, data: VirtuosoItem) => {
  switch (data.type) {
    case 'sticky-header':
      return <PageListTableHeader />;
    case 'page-group-header':
      return <PageGroupHeader {...data.data} />;
    case 'page-item':
      return <PageMetaListItemRenderer {...data.data} />;
    case 'page-item-spacer':
      return <div style={{ height: data.data.height }} />;
  }
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

const PageListInner = ({
  atTopStateChange,
  atTopThreshold,
  ...props
}: VirtualizedPageListProps) => {
  const virtuosoItems = useVirtuosoItems();
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
  return (
    <Virtuoso<VirtuosoItem>
      data-has-scroll-top={!atTop}
      atTopThreshold={atTopThreshold ?? 0}
      atTopStateChange={handleAtTopStateChange}
      components={components}
      data={virtuosoItems}
      data-testid="virtualized-page-list"
      data-total-count={props.pages.length} // for testing, since we do not know the total count in test
      topItemCount={1} // sticky header
      totalCount={virtuosoItems.length}
      itemContent={itemContentRenderer}
      className={clsx(props.className, styles.root)}
      // todo: set a reasonable overscan value to avoid blank space?
      // overscan={100}
    />
  );
};
