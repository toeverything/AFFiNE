import { SortDownIcon, SortUpIcon } from '@blocksuite/icons/rc';
import { useCallback } from 'react';

import type { ColWrapperProps, ListItem } from '../types';
import { ColWrapper } from '../utils';
import * as styles from './list-header-cell.css';

type HeaderCellProps = ColWrapperProps & {
  sortKey: keyof ListItem;
  sortable?: boolean;
  order?: 'asc' | 'desc';
  sorting?: boolean;
  onSort?: (sortable?: boolean, sortKey?: keyof ListItem) => void;
};

export const ListHeaderCell = ({
  sortKey,
  sortable,
  order,
  sorting,
  onSort,
  alignment,
  flex,
  style,
  hidden,
  hideInSmallContainer,
  children,
}: HeaderCellProps) => {
  const handleClick = useCallback(() => {
    if (sortable) {
      onSort?.(sortable, sortKey);
    }
  }, [sortable, sortKey, onSort]);

  return (
    <ColWrapper
      flex={flex}
      alignment={alignment}
      onClick={handleClick}
      className={styles.headerCell}
      data-sortable={sortable ? true : undefined}
      data-sorting={sorting ? true : undefined}
      hidden={hidden}
      style={style}
      role="columnheader"
      hideInSmallContainer={hideInSmallContainer}
    >
      {children}
      {sorting ? (
        <div className={styles.headerCellSortIcon}>
          {order === 'asc' ? <SortUpIcon /> : <SortDownIcon />}
        </div>
      ) : null}
    </ColWrapper>
  );
};
