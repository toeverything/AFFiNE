import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MultiSelectIcon, SortDownIcon, SortUpIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import clsx from 'clsx';
import { Provider, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import {
  type ForwardedRef,
  forwardRef,
  type MouseEventHandler,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';

import { Checkbox, type CheckboxProps } from '../../ui/checkbox';
import { useHasScrollTop } from '../app-sidebar/sidebar-containers/use-has-scroll-top';
import { PageGroup } from './page-group';
import * as styles from './page-list.css';
import {
  pageGroupsAtom,
  pageListHandlersAtom,
  pageListPropsAtom,
  pagesAtom,
  selectionStateAtom,
  showOperationsAtom,
  sorterAtom,
} from './scoped-atoms';
import type { PageListHandle, PageListProps } from './types';
import { ColWrapper, type ColWrapperProps, stopPropagation } from './utils';

/**
 * Given a list of pages, render a list of pages
 */
export const PageList = forwardRef<PageListHandle, PageListProps>(
  function PageListHandle(props, ref) {
    return (
      <Provider>
        <PageListInner {...props} handleRef={ref} />
      </Provider>
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
      {!hideHeader ? <PageListHeader /> : null}
      <div className={styles.groupsContainer}>
        {groups.map(group => (
          <PageGroup key={group.id} {...group} />
        ))}
      </div>
    </div>
  );
};

type HeaderCellProps = ColWrapperProps & {
  sortKey: keyof PageMeta;
  sortable?: boolean;
};

export const PageListHeaderCell = (props: HeaderCellProps) => {
  const [sorter, setSorter] = useAtom(sorterAtom);
  const onClick: MouseEventHandler = useCallback(() => {
    if (props.sortable && props.sortKey) {
      setSorter({
        newSortKey: props.sortKey,
      });
    }
  }, [props.sortKey, props.sortable, setSorter]);

  const sorting = sorter.key === props.sortKey;

  return (
    <ColWrapper
      flex={props.flex}
      alignment={props.alignment}
      onClick={onClick}
      className={styles.headerCell}
      data-sortable={props.sortable ? true : undefined}
      data-sorting={sorting ? true : undefined}
      style={props.style}
      hideInSmallContainer={props.hideInSmallContainer}
    >
      {props.children}
      {sorting ? (
        <div className={styles.headerCellSortIcon}>
          {sorter.order === 'asc' ? <SortUpIcon /> : <SortDownIcon />}
        </div>
      ) : null}
    </ColWrapper>
  );
};

type HeaderColDef = {
  key: string;
  content: ReactNode;
  flex: ColWrapperProps['flex'];
  alignment?: ColWrapperProps['alignment'];
  sortable?: boolean;
  hideInSmallContainer?: boolean;
};

// the checkbox on the header has three states:
// when list selectable = true, the checkbox will be presented
// when internal selection state is not enabled, it is a clickable <ListIcon /> that enables the selection state
// when internal selection state is enabled, it is a checkbox that reflects the selection state
const PageListHeaderCheckbox = () => {
  const [selectionState, setSelectionState] = useAtom(selectionStateAtom);
  const pages = useAtomValue(pagesAtom);
  const onActivateSelection: MouseEventHandler = useCallback(
    e => {
      stopPropagation(e);
      setSelectionState(true);
    },
    [setSelectionState]
  );
  const handlers = useAtomValue(pageListHandlersAtom);
  const onChange: NonNullable<CheckboxProps['onChange']> = useCallback(
    (e, checked) => {
      stopPropagation(e);
      handlers.onSelectedPageIdsChange?.(checked ? pages.map(p => p.id) : []);
    },
    [handlers, pages]
  );

  if (!selectionState.selectable) {
    return null;
  }

  return (
    <div
      className={styles.headerTitleSelectionIconWrapper}
      onClick={onActivateSelection}
    >
      {!selectionState.selectionActive ? (
        <MultiSelectIcon />
      ) : (
        <Checkbox
          checked={selectionState.selectedPageIds?.length === pages.length}
          indeterminate={
            selectionState.selectedPageIds &&
            selectionState.selectedPageIds.length > 0 &&
            selectionState.selectedPageIds.length < pages.length
          }
          onChange={onChange}
        />
      )}
    </div>
  );
};

const PageListHeaderTitleCell = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.headerTitleCell}>
      <PageListHeaderCheckbox />
      {t['Title']()}
    </div>
  );
};

export const PageListHeader = () => {
  const t = useAFFiNEI18N();
  const showOperations = useAtomValue(showOperationsAtom);
  const headerCols = useMemo(() => {
    const cols: (HeaderColDef | boolean)[] = [
      {
        key: 'title',
        content: <PageListHeaderTitleCell />,
        flex: 6,
        alignment: 'start',
        sortable: true,
      },
      {
        key: 'tags',
        content: t['Tags'](),
        flex: 3,
        alignment: 'end',
      },
      {
        key: 'createDate',
        content: t['Created'](),
        flex: 1,
        sortable: true,
        alignment: 'end',
        hideInSmallContainer: true,
      },
      {
        key: 'updatedDate',
        content: t['Updated'](),
        flex: 1,
        sortable: true,
        alignment: 'end',
        hideInSmallContainer: true,
      },
      showOperations && {
        key: 'actions',
        content: '',
        flex: 1,
        alignment: 'end',
      },
    ];
    return cols.filter((def): def is HeaderColDef => !!def);
  }, [t, showOperations]);
  return (
    <div className={clsx(styles.header)}>
      {headerCols.map(col => {
        return (
          <PageListHeaderCell
            flex={col.flex}
            alignment={col.alignment}
            key={col.key}
            sortKey={col.key as keyof PageMeta}
            sortable={col.sortable}
            style={{ overflow: 'visible' }}
            hideInSmallContainer={col.hideInSmallContainer}
          >
            {col.content}
          </PageListHeaderCell>
        );
      })}
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
