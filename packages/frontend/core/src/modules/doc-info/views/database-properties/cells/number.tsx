import { NumberValue } from '@affine/core/components/doc-properties/types/number';

import type { DatabaseCellRendererProps } from '../../../types';

export const NumberCell = ({
  cell,
  rowId,
  dataSource,
}: DatabaseCellRendererProps) => {
  return (
    <NumberValue
      value={cell.value}
      onChange={v => {
        dataSource.cellValueChange(rowId, cell.property.id, v);
      }}
    />
  );
};
