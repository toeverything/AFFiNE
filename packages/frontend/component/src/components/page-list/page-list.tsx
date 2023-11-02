import clsx from 'clsx';
import {
  type ForwardedRef,
  forwardRef,
  memo,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { Scrollable } from '../../ui/scrollbar';
import { useHasScrollTop } from '../app-sidebar/sidebar-containers/use-has-scroll-top';
import { PageGroup } from './page-group';
import { PageListTableHeader } from './page-header';
import * as styles from './page-list.css';
import {
  pageGroupsAtom,
  pageListPropsAtom,
  PageListProvider,
  selectionStateAtom,
  useAtom,
  useAtomValue,
  useSetAtom,
} from './scoped-atoms';
import type { PageListHandle, PageListProps } from './types';

/**
 * Given a list of pages, render a list of pages
 */
export const PageList = forwardRef<PageListHandle, PageListProps>(
  function PageList(props, ref) {
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
  }
);

// when pressing ESC or double clicking outside of the page list, close the selection mode
// todo: use jotai-effect instead but it seems it does not work with jotai-scope?
const usePageSelectionStateEffect = () => {
  const [selectionState, setSelectionActive] = useAtom(selectionStateAtom);
  useEffect(() => {
    if (
      selectionState.selectionActive &&
      selectionState.selectable === 'toggle'
    ) {
      const startTime = Date.now();
      const dblClickHandler = (e: MouseEvent) => {
        if (Date.now() - startTime < 200) {
          return;
        }
        const target = e.target as HTMLElement;
        // skip if event target is inside of a button or input
        // or within a toolbar (like page list floating toolbar)
        if (
          target.tagName === 'BUTTON' ||
          target.tagName === 'INPUT' ||
          (e.target as HTMLElement).closest('button, input, [role="toolbar"]')
        ) {
          return;
        }
        setSelectionActive(false);
      };

      const escHandler = (e: KeyboardEvent) => {
        if (Date.now() - startTime < 200) {
          return;
        }
        if (e.key === 'Escape') {
          setSelectionActive(false);
        }
      };

      document.addEventListener('dblclick', dblClickHandler);
      document.addEventListener('keydown', escHandler);

      return () => {
        document.removeEventListener('dblclick', dblClickHandler);
        document.removeEventListener('keydown', escHandler);
      };
    }
    return;
  }, [
    selectionState.selectable,
    selectionState.selectionActive,
    setSelectionActive,
  ]);
};

export const PageListInnerWrapper = memo(
  ({
    handleRef,
    children,
    onSelectionActiveChange,
    ...props
  }: PropsWithChildren<
    PageListProps & { handleRef: ForwardedRef<PageListHandle> }
  >) => {
    const setPageListPropsAtom = useSetAtom(pageListPropsAtom);
    const [selectionState, setPageListSelectionState] =
      useAtom(selectionStateAtom);
    usePageSelectionStateEffect();

    useEffect(() => {
      setPageListPropsAtom(props);
    }, [props, setPageListPropsAtom]);

    useEffect(() => {
      onSelectionActiveChange?.(!!selectionState.selectionActive);
    }, [onSelectionActiveChange, selectionState.selectionActive]);

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
    return children;
  }
);

PageListInnerWrapper.displayName = 'PageListInnerWrapper';

const PageListInner = (props: PageListProps) => {
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
    <Scrollable.Root
      style={style}
      data-has-scroll-top={hasScrollTop}
      className={clsx(styles.pageListScrollContainer, className)}
    >
      <Scrollable.Viewport ref={setNodeRef}>{children}</Scrollable.Viewport>
      <Scrollable.Scrollbar />
    </Scrollable.Root>
  );
});

PageListScrollContainer.displayName = 'PageListScrollContainer';
