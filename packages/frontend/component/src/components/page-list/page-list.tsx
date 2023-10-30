import clsx from 'clsx';
import {
  type ForwardedRef,
  forwardRef,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';

import { useHasScrollTop } from '../app-sidebar/sidebar-containers/use-has-scroll-top';
import { PageGroupHeader, PageMetaListItemRenderer } from './page-group';
import { PageListHeading, PageListTopItemListHeader } from './page-header';
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
import type { PageListHandle, PageListProps } from './types';

/**
 * Given a list of pages, render a list of pages
 */
export const PageList = forwardRef<PageListHandle, PageListProps>(
  function PageListHandle(props, ref) {
    return (
      // push pageListProps to the atom so that downstream components can consume it
      // this makes sure pageListPropsAtom is always populated
      // @ts-expect-error fix type issues later
      <PageListProvider initialValues={[[pageListPropsAtom, props]]}>
        <PageListInner {...props} handleRef={ref} />
      </PageListProvider>
    );
  }
);

const PageListInner = ({
  handleRef,
  atTopStateChange,
  atTopThreshold,
  ...props
}: PageListProps & { handleRef: ForwardedRef<PageListHandle> }) => {
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

  const groups = useAtomValue(pageGroupsAtom);
  const groupCollapsedState = useAtomValue(pageGroupCollapseStateAtom);
  const groupCounts = useMemo(() => {
    // if the group is collapsed, we will only show the header
    return groups.map(group =>
      groupCollapsedState[group.id] ? 0 : group.items.length
    );
  }, [groupCollapsedState, groups]);
  return (
    <GroupedVirtuoso
      atTopThreshold={atTopThreshold}
      atTopStateChange={atTopStateChange}
      components={{
        TopItemList: PageListTopItemListHeader,
        Header: PageListHeading,
      }}
      groupCounts={groupCounts}
      groupContent={idx => {
        const group = groups[idx];
        return (
          <>
            <div style={{ height: 35 }} />
            <PageGroupHeader {...group} />
          </>
        );
      }}
      itemContent={(index, groupIndex) => {
        // calculate the index in group
        const prevGroupCounts = groupCounts
          .slice(0, groupIndex)
          .reduce((a, b) => a + b, 0);
        const itemIndex = index - prevGroupCounts;
        const group = groups[groupIndex];
        const item = group.items[itemIndex];
        return (
          <>
            <PageMetaListItemRenderer {...item} />
          </>
        );
      }}
      className={clsx(props.className, styles.root)}
    />
  );
};

interface PageListScrollContainerProps {
  className?: string;
  style?: React.CSSProperties;
}

export const PageListScrollContainer = forwardRef<
  HTMLDivElement,
  PropsWithChildren<PageListScrollContainerProps>
>(({ className, children, style }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasScrollTop = useHasScrollTop(containerRef);

  const setNodeRef = useCallback(
    (r: HTMLDivElement) => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(r);
        } else {
          ref.current = r;
        }
      }
      containerRef.current = r;
    },
    [ref]
  );

  return (
    <div
      style={style}
      ref={setNodeRef}
      data-has-scroll-top={hasScrollTop}
      className={clsx(styles.pageListScrollContainer, className)}
    >
      {children}
    </div>
  );
});

PageListScrollContainer.displayName = 'PageListScrollContainer';
