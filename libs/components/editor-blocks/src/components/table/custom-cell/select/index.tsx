import type { FC } from 'react';
import { useMemo } from 'react';
import { OldSelect } from '@toeverything/components/ui';
import type { EnumColumnValue } from '@toeverything/datasource/db-service';
import { isEnumColumn } from '@toeverything/datasource/db-service';
import type { CellProps } from '../types';

/**
 * @deprecated
 */
export const SelectCell = ({
    value,
    column,
    onChange,
}: CellProps<EnumColumnValue>) => {
    const options = useMemo(() => {
        if (isEnumColumn(column.columnConfig)) {
            return column.columnConfig.options.map(option => {
                return {
                    label: option.name,
                    value: String(option.value),
                };
            });
        }
        return [];
    }, [column]);
    return (
        <OldSelect
            value={value?.value?.[0]}
            options={options}
            onChange={eventValue => onChange({ value: [eventValue] })}
        />
    );
};
