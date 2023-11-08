import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MultiSelectIcon, SortDownIcon, SortUpIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import clsx from 'clsx';
import { selectAtom } from 'jotai/utils';
import {
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useMemo,
} from 'react';

import { Checkbox, type CheckboxProps } from '../../ui/checkbox';
import * as styles from './page-list.css';
import {
  pageListHandlersAtom,
  pageListPropsAtom,
  pagesAtom,
  selectionStateAtom,
  showOperationsAtom,
  sorterAtom,
  useAtom,
  useAtomValue,
} from './scoped-atoms';
import { ColWrapper, type ColWrapperProps, stopPropagation } from './utils';

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
      role="columnheader"
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

type HeaderCellProps = ColWrapperProps & {
  sortKey: keyof PageMeta;
  sortable?: boolean;
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
      data-testid="page-list-header-selection-checkbox"
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

const hideHeaderAtom = selectAtom(pageListPropsAtom, props => props.hideHeader);

// the table header for page list
export const PageListTableHeader = () => {
  const t = useAFFiNEI18N();
  const showOperations = useAtomValue(showOperationsAtom);
  const hideHeader = useAtomValue(hideHeaderAtom);
  const selectionState = useAtomValue(selectionStateAtom);
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

  if (hideHeader) {
    return false;
  }

  return (
    <div
      className={clsx(styles.tableHeader)}
      data-selectable={selectionState.selectable}
      data-selection-active={selectionState.selectionActive}
    >
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
