import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MultiSelectIcon, SortDownIcon, SortUpIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { Checkbox, type CheckboxProps } from '@mui/material';
import clsx from 'clsx';
import { Provider, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { selectAtom, useHydrateAtoms } from 'jotai/utils';
import {
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

import { PageGroup } from './page-group';
import * as styles from './page-list.css';
import {
  pageGroupsAtom,
  pageListHandlersAtom,
  pageListPropsAtom,
  pagesAtom,
  selectionStateAtom,
  sorterAtom,
} from './scoped-atoms';
import type { PageListProps } from './types';
import { ColWrapper, type ColWrapperProps, stopPropagation } from './utils';

/**
 * Given a list of pages, render a list of pages
 */
export const PageList = (props: PageListProps) => {
  return (
    <Provider>
      <PageListInner {...props} />
    </Provider>
  );
};

const PageListInner = (props: PageListProps) => {
  // push pageListProps to the atom so that downstream components can consume it
  useHydrateAtoms([[pageListPropsAtom, props]], {
    // note: by turning on dangerouslyForceHydrate, downstream component need to use selectAtom to consume the atom
    // note2: not using it for now because it will cause some other issues
    // dangerouslyForceHydrate: true,
  });

  const setPageListPropsAtom = useSetAtom(pageListPropsAtom);

  useEffect(() => {
    setPageListPropsAtom(props);
  }, [props, setPageListPropsAtom]);

  const groups = useAtomValue(pageGroupsAtom);
  return (
    <div className={clsx(props.className, styles.root)}>
      <PageListHeader />
      {groups.length === 0 && props.fallback ? (
        props.fallback
      ) : (
        <div className={styles.groupsContainer}>
          {groups.map(group => (
            <PageGroup key={group.id} {...group} />
          ))}
        </div>
      )}
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
};

// the checkbox on the header has three states:
// when list selectable = true, the checkbox will be presented
// when internal selection state is not enabled, it is a clickable <ListIcon /> that enables the selection state
// when internal selection state is enabled, it is a checkbox that reflects the selection state
const PageListHeaderCheckbox = () => {
  const selectionState = useAtomValue(selectionStateAtom);
  const setSelectionActive = useSetAtom(selectionStateAtom);
  const pages = useAtomValue(pagesAtom);
  const onActivateSelection: MouseEventHandler = useCallback(
    e => {
      stopPropagation(e);
      setSelectionActive(true);
    },
    [setSelectionActive]
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
    return <div style={{ width: '20px' }}></div>;
  }

  if (selectionState.selectionActive) {
    return (
      <Checkbox
        checked={selectionState.selectedPageIds?.length === pages.length}
        indeterminate={
          selectionState.selectedPageIds &&
          selectionState.selectedPageIds.length > 0 &&
          selectionState.selectedPageIds.length < pages.length
        }
        onChange={onChange}
        size="small"
      />
    );
  } else {
    return (
      <div
        style={{ width: '56px' }}
        className={styles.headerTitleSelectionIconWrapper}
        onClick={onActivateSelection}
      >
        <MultiSelectIcon />
      </div>
    );
  }
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

const showOperationsAtom = selectAtom(
  pageListPropsAtom,
  props => !!props.pageOperationsRenderer
);

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
      },
      {
        key: 'updatedDate',
        content: t['Updated'](),
        flex: 1,
        sortable: true,
        alignment: 'end',
      },
      showOperations && {
        key: 'actions',
        content: t['Actions'](),
        flex: 1,
        alignment: 'end',
      },
    ];
    return cols.filter((def): def is HeaderColDef => !!def);
  }, [t, showOperations]);
  return (
    <div className={styles.header}>
      {headerCols.map(col => {
        return (
          <PageListHeaderCell
            flex={col.flex}
            alignment={col.alignment}
            key={col.key}
            sortKey={col.key as keyof PageMeta}
            sortable={col.sortable}
            style={{ overflow: 'visible' }}
          >
            {col.content}
          </PageListHeaderCell>
        );
      })}
    </div>
  );
};
