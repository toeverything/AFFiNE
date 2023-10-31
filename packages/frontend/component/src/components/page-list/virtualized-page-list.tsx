import type { PageMeta } from '@blocksuite/store';
import clsx from 'clsx';
import { atom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import {
  type ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Virtuoso } from 'react-virtuoso';

import { PageGroupHeader, PageMetaListItemRenderer } from './page-group';
import { PageListTableHeader } from './page-header';
import * as styles from './page-list.css';
import {
  pageGroupCollapseStateAtom,
  pageGroupsAtom,
  pageListPropsAtom,
  PageListProvider,
  selectionStateAtom,
  useAtomValue,
  useSetAtom,
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
      <PageListInner {...props} handleRef={ref} />
    </PageListProvider>
  );
});

const headingAtom = selectAtom(pageListPropsAtom, props => props.heading);

const PageListHeading = () => {
  const heading = useAtomValue(headingAtom);
  return <div className={styles.heading}>{heading}</div>;
};

const virtuosoItemsAtom = atom(get => {
  const groups = get(pageGroupsAtom);
  const groupCollapsedState = get(pageGroupCollapseStateAtom);
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
});

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

const PageListInner = ({
  handleRef,
  atTopStateChange,
  atTopThreshold,
  ...props
}: VirtualizedPageListProps & { handleRef: ForwardedRef<PageListHandle> }) => {
  const setPageListPropsAtom = useSetAtom(pageListPropsAtom);
  const setPageListSelectionState = useSetAtom(selectionStateAtom);

  useEffect(() => {
    setPageListPropsAtom(props);
  }, [props, setPageListPropsAtom]);

  useImperativeHandle(
    handleRef,
    () => {
      return {
        toggleSelectable: () => {
          setPageListSelectionState(false);
        },
      };
    },
    [setPageListSelectionState]
  );

  const virtuosoItems = useAtomValue(virtuosoItemsAtom);

  const [atTop, setAtTop] = useState(false);

  const handleAtTopStateChange = useCallback(
    (atTop: boolean) => {
      setAtTop(atTop);
      atTopStateChange?.(atTop);
    },
    [atTopStateChange]
  );

  return (
    <Virtuoso<VirtuosoItem>
      data-has-scroll-top={!atTop}
      atTopThreshold={atTopThreshold ?? 0}
      atTopStateChange={handleAtTopStateChange}
      components={{
        Header: props.heading ? PageListHeading : undefined,
      }}
      data={virtuosoItems}
      topItemCount={1} // sticky header
      totalCount={virtuosoItems.length}
      itemContent={itemContentRenderer}
      className={clsx(props.className, styles.root)}
      // todo: set a reasonable overscan value to avoid blank space?
      // overscan={100}
    />
  );
};
