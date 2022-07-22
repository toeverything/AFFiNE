import { OldSelect, styled } from '@toeverything/components/ui';
import { DeleteCashBinIcon } from '@toeverything/components/icons';
import {
    FILTER_GROUP_CHANGE_TYPES,
    ruleMap,
} from './config/filter-group-config';
import { getOptionsFromNativeData } from '../helper';
import { MultipleChipInput } from './MultipleChipInput';
import { TextInput } from './TextInput';
import { Checkbox } from './Checkbox';
import type { CSSProperties } from 'react';
import type { SorterItemProps } from './types';
import { ValueOption } from './types';

export const StyledSorterItem = styled('div')({
    display: 'flex',
    alignItems: 'center',
    '& select': {
        margin: '6px',
    },
});

const selectStyle: CSSProperties = {
    height: 32,
    border: '1px solid #E0E6EB',
    borderRadius: 5,
    padding: '0 12px',
    color: '#4C6275',
    fontSize: 14,
};

const fieldSelectStyle: CSSProperties = {
    ...selectStyle,
    minWidth: 168,
};

const relationSelectStyle: CSSProperties = {
    ...selectStyle,
    minWidth: 108,
};

const SorterItem = (props: SorterItemProps) => {
    const { onConstraintChange, ...rest } = props;
    const { fieldOptions, valueOptions } = getOptionsFromNativeData(rest);
    const {
        constraint: [
            key,
            { checked, type, fieldValue, opSelectValue, valueSelectValue },
        ],
    } = rest;
    const ruleOptions = Object.values(ruleMap.get(type));

    /* key change */
    const onFieldChange = (newKey: string) => {
        const { type } = fieldOptions.filter(item => item.key === newKey)[0];
        onConstraintChange({
            type: FILTER_GROUP_CHANGE_TYPES.KEY_CHANGE,
            deleteKey: key,
            newData: [
                newKey,
                {
                    key: newKey,
                    type,
                    fieldValue: newKey,
                    checked: true,
                    opSelectValue: Object.values(ruleMap.get(type))?.[0]?.value,
                    valueSelectValue: null,
                },
            ],
        });
    };

    /* op change */
    const onOpChange = (newOp: string) => {
        onConstraintChange({
            type: FILTER_GROUP_CHANGE_TYPES.OP_CHANGE,
            newData: [
                key,
                {
                    key,
                    type,
                    checked,
                    fieldValue,
                    opSelectValue: newOp,
                    valueSelectValue,
                },
            ],
        });
    };

    /* value change */
    const onValueChange = (newValue: string | ValueOption[]) => {
        onConstraintChange({
            type: FILTER_GROUP_CHANGE_TYPES.VALUE_CHANGE,
            newData: [
                key,
                {
                    key,
                    type,
                    checked,
                    fieldValue,
                    opSelectValue,
                    valueSelectValue: newValue,
                },
            ],
        });
    };

    /* CheckBox change */
    const onCheckChange = () => {
        onConstraintChange({
            type: FILTER_GROUP_CHANGE_TYPES.CHECK_CHANGE,
            newData: [
                key,
                {
                    key,
                    type,
                    fieldValue,
                    checked: !checked,
                    opSelectValue,
                    valueSelectValue,
                },
            ],
        });
    };

    /* delete constraint */
    const deleteConstraint = () => {
        onConstraintChange({
            type: FILTER_GROUP_CHANGE_TYPES.RULE_DELETE,
            deleteKey: key,
        });
    };

    return (
        <StyledSorterItem>
            <Checkbox value={checked} onChange={onCheckChange} />

            <OldSelect
                extraStyle={fieldSelectStyle}
                value={fieldValue}
                options={fieldOptions}
                onChange={onFieldChange}
            />
            <OldSelect
                extraStyle={relationSelectStyle}
                value={opSelectValue}
                options={ruleOptions}
                onChange={onOpChange}
            />
            {valueOptions?.length ? (
                <MultipleChipInput
                    initValue={(valueSelectValue || []) as string[]}
                    options={valueOptions}
                    onChange={onValueChange}
                />
            ) : (
                <TextInput
                    value={(valueSelectValue || '') as string}
                    onChange={onValueChange}
                />
            )}
            <DeleteCashBinIcon fontSize="small" onClick={deleteConstraint} />
        </StyledSorterItem>
    );
};

export { SorterItem };
