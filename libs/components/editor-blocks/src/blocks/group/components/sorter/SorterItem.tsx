import { OldSelect, styled } from '@toeverything/components/ui';
import { DeleteCashBinIcon } from '@toeverything/components/icons';
import type { CSSProperties } from 'react';
import type { SorterItemProps } from './types';

export const StyledSorterItem = styled('div')({
    display: 'flex',
    alignItems: 'center',
    '& select': {
        margin: '6px',
    },
});

const extraStyle: CSSProperties = {
    width: 180,
    height: 32,
    border: '1px solid #E0E6EB',
    borderRadius: 5,
    padding: '0 12px',
};

const SorterItem = (props: SorterItemProps) => {
    const {
        constraint,
        constraints,
        fieldOptions,
        ruleOptions,
        onConstraintChange,
    } = props;
    /* current constraint */
    const [field, { rule }] = constraint;

    /**
     * field change & update constraints
     * @param newField
     */
    const onFieldChange = (newField: string) => {
        onConstraintChange({
            oldField: field,
            newField,
            newRule: rule,
        });
    };

    /**
     * rule change & update constraints
     * @param newRule
     */
    const onRuleChange = (newRule: string) => {
        onConstraintChange({
            newField: field,
            newRule,
        });
    };

    /**
     * delete current constrain & update constraints
     * @param newField
     */
    const deleteConstraint = () => {
        onConstraintChange({
            oldField: field,
        });
    };

    /* recast options: contains current and unselected */
    const effectiveOptions = fieldOptions.filter(
        fieldOption =>
            !constraints.has(fieldOption.key) || fieldOption.key === field
    );

    return (
        <StyledSorterItem>
            <OldSelect
                extraStyle={extraStyle}
                value={field}
                options={effectiveOptions}
                onChange={onFieldChange}
            />
            <OldSelect
                extraStyle={{ ...extraStyle, width: 125 }}
                value={rule}
                options={ruleOptions}
                onChange={onRuleChange}
            />
            <DeleteCashBinIcon fontSize="small" onClick={deleteConstraint} />
        </StyledSorterItem>
    );
};

export { SorterItem };
