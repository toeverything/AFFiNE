import type { CheckboxProps } from '@affine/component';
import { Checkbox } from '@affine/component';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { useI18n } from '@affine/i18n';
import { MultiSelectIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { selectAtom } from 'jotai/utils';
import type { MouseEventHandler } from 'react';
import { useCallback } from 'react';

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

// the checkbox on the header has three states:
// when list selectable = true, the checkbox will be presented
// when internal selection state is not enabled, it is a clickable <ListIcon /> that enables the selection state
// when internal selection state is enabled, it is a checkbox that reflects the selection state
const ListHeaderCheckbox = () => {
  const [selectionState, setSelectionState] = useAtom(selectionStateAtom);
  const items = useAtomValue(itemsAtom);
  const onActivateSelection: MouseEventHandler = useCatchEventCallback(() => {
    setSelectionState(true);
  }, [setSelectionState]);
  const handlers = useAtomValue(listHandlersAtom);
  const onChange: NonNullable<CheckboxProps['onChange']> =
    useCatchEventCallback(
      (_e, checked) => {
        handlers.onSelectedIdsChange?.(
          checked ? (items ?? []).map(i => i.id) : []
        );
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
          checked={selectionState.selectedIds?.length === items?.length}
          indeterminate={
            selectionState.selectedIds &&
            selectionState.selectedIds.length > 0 &&
            selectionState.selectedIds.length < (items?.length ?? 0)
          }
          onChange={onChange}
        />
      )}
    </div>
  );
};

export const ListHeaderTitleCell = () => {
  const t = useI18n();
  return (
    <div className={styles.headerTitleCell}>
      <ListHeaderCheckbox />
      {t['Title']()}
    </div>
  );
};

const hideHeaderAtom = selectAtom(listPropsAtom, props => props?.hideHeader);

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
        const isTagHidden = col.key === 'tags' && col.hidden;
        return (
          <ListHeaderCell
            flex={col.flex}
            alignment={col.alignment}
            key={col.key}
            sortKey={col.key as keyof ListItem}
            sortable={col.sortable}
            sorting={sorter.key === col.key}
            order={sorter.order}
            hidden={isTagHidden ? false : col.hidden}
            onSort={onSort}
            style={{
              overflow: 'visible',
              visibility: isTagHidden ? 'hidden' : 'visible',
            }}
            hideInSmallContainer={col.hideInSmallContainer}
          >
            {col.content}
          </ListHeaderCell>
        );
      })}
    </div>
  );
};
