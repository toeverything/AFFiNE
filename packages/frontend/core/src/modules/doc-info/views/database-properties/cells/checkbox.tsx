import { CheckboxValue } from '@affine/core/components/workspace-property-types/checkbox';
import type { LiveData } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';

import type { DatabaseCellRendererProps } from '../../../types';

export const CheckboxCell = ({
  cell,
  rowId,
  dataSource,
  onChange,
}: DatabaseCellRendererProps) => {
  const value = useLiveData(cell.value$ as LiveData<boolean>);
  return (
    <CheckboxValue
      // todo(pengx17): better internal impl
      value={value ? 'true' : 'false'}
      onChange={v => {
        dataSource.cellValueChange(rowId, cell.property.id, v === 'true');
        onChange?.(v === 'true');
      }}
    />
  );
};
