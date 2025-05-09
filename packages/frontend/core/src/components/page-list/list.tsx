import { Scrollable, useHasScrollTop } from '@affine/component';
import clsx from 'clsx';
import type { ForwardedRef, PropsWithChildren } from 'react';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
} from 'react';

import { usePageHeaderColsDef } from './header-col-def';
import * as styles from './list.css';
import { ItemGroup } from './page-group';
import { ListTableHeader } from './page-header';
import {
  groupsAtom,
  listPropsAtom,
  ListProvider,
  selectionStateAtom,
  useAtom,
  useAtomValue,
  useSetAtom,
} from './scoped-atoms';
import type { ItemListHandle, ListItem, ListProps } from './types';

/**
 * Given a list of pages, render a list of pages
 */
export const List = forwardRef<ItemListHandle, ListProps<ListItem>>(
  function List(props, ref) {
    return (
      // push pageListProps to the atom so that downstream components can consume it
      // this makes sure pageListPropsAtom is always populated
      // @ts-expect-error jotai-scope is not well typed, AnyWritableAtom is should be any rather than unknown
      <ListProvider initialValues={[[listPropsAtom, props]]}>
        <ListInnerWrapper {...props} handleRef={ref}>
          <ListInner {...props} />
        </ListInnerWrapper>
      </ListProvider>
    );
  }
);

// when pressing ESC or double clicking outside of the page list, close the selection mode
// TODO(@Peng): use jotai-effect instead but it seems it does not work with jotai-scope?
const useItemSelectionStateEffect = () => {
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
          (e.target as HTMLElement).closest(
            'button, input, [role="toolbar"], [role="list-item"]'
          )
        ) {
          return;
        }
        setSelectionActive(false);
        selectionState.onSelectedIdsChange?.([]);
      };

      const escHandler = (e: KeyboardEvent) => {
        if (Date.now() - startTime < 200) {
          return;
        }
        if (e.key === 'Escape') {
          setSelectionActive(false);
          selectionState.onSelectedIdsChange?.([]);
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
    selectionState,
    selectionState.selectable,
    selectionState.selectionActive,
    setSelectionActive,
  ]);
};

export const ListInnerWrapper = memo(
  ({
    handleRef,
    children,
    onSelectionActiveChange,
    ...props
  }: PropsWithChildren<
    ListProps<ListItem> & { handleRef: ForwardedRef<ItemListHandle> }
  >) => {
    const setListPropsAtom = useSetAtom(listPropsAtom);
    const [selectionState, setListSelectionState] = useAtom(selectionStateAtom);
    useItemSelectionStateEffect();

    useEffect(() => {
      setListPropsAtom(props);
    }, [props, setListPropsAtom]);

    useEffect(() => {
      onSelectionActiveChange?.(!!selectionState.selectionActive);
    }, [onSelectionActiveChange, selectionState.selectionActive]);

    useImperativeHandle(handleRef, () => {
      return {
        toggleSelectable: () => {
          setListSelectionState(false);
        },
      };
    }, [setListSelectionState]);
    return children;
  }
);

ListInnerWrapper.displayName = 'ListInnerWrapper';

const ListInner = (props: ListProps<ListItem>) => {
  const groups = useAtomValue(groupsAtom);
  const pageHeaderColsDef = usePageHeaderColsDef();
  const hideHeader = props.hideHeader;
  return (
    <div className={clsx(props.className, styles.root)}>
      {!hideHeader ? <ListTableHeader headerCols={pageHeaderColsDef} /> : null}
      <div className={styles.groupsContainer}>
        {groups.map(group => (
          <ItemGroup key={group.id} {...group} />
        ))}
      </div>
    </div>
  );
};

interface ListScrollContainerProps {
  className?: string;
  style?: React.CSSProperties;
}

export const ListScrollContainer = forwardRef<
  HTMLDivElement,
  PropsWithChildren<ListScrollContainerProps>
>(({ className, children, style }, ref) => {
  const [setContainer, hasScrollTop] = useHasScrollTop();

  const setNodeRef = useCallback(
    (r: HTMLDivElement) => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(r);
        } else {
          ref.current = r;
        }
      }
      return setContainer(r);
    },
    [ref, setContainer]
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

ListScrollContainer.displayName = 'ListScrollContainer';
