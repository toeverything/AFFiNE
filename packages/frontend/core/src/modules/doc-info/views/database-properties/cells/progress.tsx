import { Progress, PropertyValue } from '@affine/component';
import type { LiveData } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import type { DatabaseCellRendererProps } from '../../../types';

export const ProgressCell = ({
  cell,
  dataSource,
  rowId,
}: DatabaseCellRendererProps) => {
  const value = useLiveData(cell.value$ as LiveData<number>);
  const isEmpty = value === undefined;
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <PropertyValue isEmpty={isEmpty} hoverable={false}>
      <Progress
        value={localValue}
        onChange={v => {
          setLocalValue(v);
        }}
        onBlur={() => {
          dataSource.cellValueChange(rowId, cell.id, localValue);
        }}
      />
    </PropertyValue>
  );
};
