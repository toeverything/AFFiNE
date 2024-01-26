import { Checkbox, type CheckboxProps } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MultiSelectIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { selectAtom } from 'jotai/utils';
import { type MouseEventHandler, useCallback } from 'react';

import { ListHeaderCell } from './components/list-header-cell';
import * as styles from './page-header.css';
import {
  itemsAtom,
  listHandlersAtom,
  listPropsAtom,
  selectionStateAtom,
  sorterAtom,
  useAtom,
  useAtomValue,
} from './scoped-atoms';
import type { HeaderColDef, ListItem } from './types';
import { stopPropagation } from './utils';

// the checkbox on the header has three states:
// when list selectable = true, the checkbox will be presented
// when internal selection state is not enabled, it is a clickable <ListIcon /> that enables the selection state
// when internal selection state is enabled, it is a checkbox that reflects the selection state
const ListHeaderCheckbox = () => {
  const [selectionState, setSelectionState] = useAtom(selectionStateAtom);
  const items = useAtomValue(itemsAtom);
  const onActivateSelection: MouseEventHandler = useCallback(
    e => {
      stopPropagation(e);
      setSelectionState(true);
    },
    [setSelectionState]
  );
  const handlers = useAtomValue(listHandlersAtom);
  const onChange: NonNullable<CheckboxProps['onChange']> = useCallback(
    (e, checked) => {
      stopPropagation(e);
      handlers.onSelectedIdsChange?.(checked ? items.map(i => i.id) : []);
    },
    [handlers, items]
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
          checked={selectionState.selectedIds?.length === items.length}
          indeterminate={
            selectionState.selectedIds &&
            selectionState.selectedIds.length > 0 &&
            selectionState.selectedIds.length < items.length
          }
          onChange={onChange}
        />
      )}
    </div>
  );
};

export const ListHeaderTitleCell = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.headerTitleCell}>
      <ListHeaderCheckbox />
      {t['Title']()}
    </div>
  );
};

const hideHeaderAtom = selectAtom(listPropsAtom, props => props.hideHeader);

// the table header for page list
export const ListTableHeader = ({
  headerCols,
}: {
  headerCols: HeaderColDef[];
}) => {
  const [sorter, setSorter] = useAtom(sorterAtom);
  const hideHeader = useAtomValue(hideHeaderAtom);
  const selectionState = useAtomValue(selectionStateAtom);
  const onSort = useCallback(
    (sortable?: boolean, sortKey?: keyof ListItem) => {
      if (sortable && sortKey) {
        setSorter({
          newSortKey: sortKey,
        });
      }
    },
    [setSorter]
  );

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
          <ListHeaderCell
            flex={col.flex}
            alignment={col.alignment}
            key={col.key}
            sortKey={col.key as keyof ListItem}
            sortable={col.sortable}
            sorting={sorter.key === col.key}
            order={sorter.order}
            onSort={onSort}
            style={{ overflow: 'visible' }}
            hideInSmallContainer={col.hideInSmallContainer}
          >
            {col.content}
          </ListHeaderCell>
        );
      })}
    </div>
  );
};
