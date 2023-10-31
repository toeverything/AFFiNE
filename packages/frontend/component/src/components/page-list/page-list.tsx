import clsx from 'clsx';
import { useHydrateAtoms } from 'jotai/utils';
import {
  type ForwardedRef,
  forwardRef,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { useHasScrollTop } from '../app-sidebar/sidebar-containers/use-has-scroll-top';
import { PageGroup } from './page-group';
import { PageListTableHeader } from './page-header';
import * as styles from './page-list.css';
import {
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
  ...props
}: PageListProps & { handleRef: ForwardedRef<PageListHandle> }) => {
  // push pageListProps to the atom so that downstream components can consume it
  useHydrateAtoms([[pageListPropsAtom, props]], {
    // note: by turning on dangerouslyForceHydrate, downstream component need to use selectAtom to consume the atom
    // note2: not using it for now because it will cause some other issues
    // dangerouslyForceHydrate: true,
  });

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
  const hideHeader = props.hideHeader;
  return (
    <div className={clsx(props.className, styles.root)}>
      {!hideHeader ? <PageListTableHeader /> : null}
      <div className={styles.groupsContainer}>
        {groups.map(group => (
          <PageGroup key={group.id} {...group} />
        ))}
      </div>
    </div>
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
