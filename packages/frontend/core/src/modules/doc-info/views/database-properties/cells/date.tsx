import { DateValue } from '@affine/core/components/doc-properties/types/date';
import dayjs from 'dayjs';

import type { DatabaseCellRendererProps } from '../../../types';

const toInternalDateString = (date: unknown) => {
  if (typeof date !== 'string' && typeof date !== 'number') {
    return '';
  }
  return dayjs(date).format('YYYY-MM-DD');
};

const fromInternalDateString = (date: string) => {
  return dayjs(date).toDate().getTime();
};

export const DateCell = ({
  cell,
  rowId,
  dataSource,
}: DatabaseCellRendererProps) => {
  return (
    <DateValue
      value={cell.value ? toInternalDateString(cell.value) : ''}
      onChange={v => {
        dataSource.cellValueChange(
          rowId,
          cell.property.id,
          fromInternalDateString(v)
        );
      }}
    />
  );
};
