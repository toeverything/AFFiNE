import type { TableCellProps } from '@affine/component';
import { TableCell } from '@affine/component';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(localizedFormat);

export const DateCell = ({
  date,
  ...props
}: {
  date?: number | unknown;
} & Omit<TableCellProps, 'children'>) => {
  const dateStr =
    typeof date === 'number' ? dayjs(date).format('YYYY-MM-DD HH:mm') : '--';
  return (
    <TableCell ellipsis={true} {...props}>
      {dateStr}
    </TableCell>
  );
};

export default DateCell;
