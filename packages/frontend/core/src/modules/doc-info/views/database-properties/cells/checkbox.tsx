import { CheckboxValue } from '@affine/core/components/doc-properties/types/checkbox';

import type { DatabaseCellRendererProps } from '../../../types';

export const CheckboxCell = ({
  cell,
  rowId,
  dataSource,
}: DatabaseCellRendererProps) => {
  return (
    <CheckboxValue
      // todo(pengx17): better internal impl
      value={cell.value ? 'true' : 'false'}
      onChange={v => {
        dataSource.cellValueChange(rowId, cell.property.id, v === 'true');
      }}
    />
  );
};
