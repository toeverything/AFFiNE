import type { FC } from 'react';
import { Checkbox } from '@toeverything/components/ui';
import type { BooleanColumnValue } from '@toeverything/datasource/db-service';
import type { CellProps } from '../types';

/**
 * @deprecated
 */
export const CheckBoxCell: FC<CellProps<BooleanColumnValue>> = ({
    value,
    onChange,
}) => {
    return (
        <Checkbox
            checked={value?.value}
            onChange={event => onChange({ value: event.target.checked })}
        />
    );
};
