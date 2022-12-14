import localizedFormat from 'dayjs/plugin/localizedFormat';
import dayjs from 'dayjs';
import { PageMeta } from '@/providers/editor-provider';
import { TableCell } from '@/ui/table';
import React from 'react';

dayjs.extend(localizedFormat);

export const DateCell = ({
  pageMeta,
  dateKey,
}: {
  pageMeta: PageMeta;
  dateKey: keyof PageMeta;
}) => {
  // dayjs().format('L LT');
  return (
    <TableCell ellipsis={true}>
      {pageMeta[dateKey] === undefined
        ? '--'
        : dayjs(pageMeta[dateKey] as string).format('YYYY-MM-DD HH:MM')}
    </TableCell>
  );
};

export default DateCell;
