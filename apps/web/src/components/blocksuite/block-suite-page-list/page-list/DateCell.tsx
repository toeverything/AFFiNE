import { TableCell, TableCellProps } from '@affine/component';
import { PageMeta } from '@blocksuite/store';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import React from 'react';

dayjs.extend(localizedFormat);

export const DateCell = ({
  pageMeta,
  dateKey,
  backupKey = '',
  ...props
}: {
  pageMeta: PageMeta;
  dateKey: keyof PageMeta;
  backupKey?: keyof PageMeta;
} & Omit<TableCellProps, 'children'>) => {
  const value = pageMeta[dateKey] ?? pageMeta[backupKey];
  return (
    <TableCell ellipsis={true} {...props}>
      {value ? dayjs(value as string).format('YYYY-MM-DD HH:mm') : '--'}
    </TableCell>
  );
};

export default DateCell;
