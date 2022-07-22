import { useContext } from 'react';
import { styled } from '@toeverything/components/ui';
import { SorterItem } from './SelectItem';
import { HandleGroup } from './HandleGroup';
import { Introduce } from '../sorter/Introduce';
import {
    FILTER_GROUP_CHANGE_TYPES,
    ruleMap,
} from './config/filter-group-config';
import { FilterContext } from './context/filter-context';
import { makeFilterConstraint2Map } from './helper';
import type {
    Constraint,
    ConstraintKey,
    Context,
    OnConstraintChange,
} from './types';
import type { Column } from '@toeverything/datasource/db-service';

const StyledFilterGroup = styled('div')({
    marginTop: 16,
    width: 684,
    padding: 12,
    display: 'flex',
    justifyContent: 'center',
    flexDirection: 'column',
});

const FilterGroup = () => {
    const { block } = useContext<Context>(FilterContext);
    const fieldOption = (block.columns as Column[])?.filter(
        ({ innerColumn }) => !innerColumn
    );
    const filterConstraintMap = makeFilterConstraint2Map(
        block.getProperties()?.filterConstraint || []
    );

    /**
     * update filter constraints
     * @param type
     * @param deleteKey
     * @param newData
     */
    const onConstraintChange: OnConstraintChange = async ({
        type,
        deleteKey,
        newData = [],
    }) => {
        const newFilterConstraint = new Map([...filterConstraintMap]);
        const [key, value] = newData;

        switch (type) {
            case FILTER_GROUP_CHANGE_TYPES.RULE_ADD:
            case FILTER_GROUP_CHANGE_TYPES.CHECK_CHANGE:
            case FILTER_GROUP_CHANGE_TYPES.OP_CHANGE:
            case FILTER_GROUP_CHANGE_TYPES.VALUE_CHANGE: {
                newFilterConstraint.set(key, value);
                break;
            }
            case FILTER_GROUP_CHANGE_TYPES.RULE_DELETE: {
                newFilterConstraint.delete(deleteKey);
                break;
            }
            case FILTER_GROUP_CHANGE_TYPES.KEY_CHANGE: {
                newFilterConstraint.delete(deleteKey);
                newFilterConstraint.set(key, value);
                break;
            }
            default:
                throw new Error(`group_change_action.type error: ${type}`);
        }

        await block.setProperties({
            filterConstraint: Array.from(newFilterConstraint.values()),
        });
    };

    /**
     * add filter item
     */
    const addRule = async () => {
        for (const option of fieldOption) {
            const { key, type } = option;
            if (!filterConstraintMap.has(key)) {
                await onConstraintChange({
                    type: FILTER_GROUP_CHANGE_TYPES.RULE_ADD,
                    newData: [
                        key,
                        {
                            key,
                            type,
                            fieldValue: key,
                            checked: true,
                            opSelectValue: Object.values(ruleMap.get(type))?.[0]
                                ?.value,
                            valueSelectValue: null,
                        },
                    ],
                });

                return;
            }
        }
    };

    /* translate Map to Array for render */
    const filterConstraints: Array<[ConstraintKey, Constraint]> = Array.from(
        filterConstraintMap.entries()
    );

    return (
        <>
            <StyledFilterGroup>
                {filterConstraints.length ? (
                    filterConstraints.map(constraint => {
                        const key = constraint[0];
                        return (
                            <SorterItem
                                key={key}
                                constraint={constraint}
                                constraints={filterConstraintMap}
                                fieldOptions={fieldOption}
                                onConstraintChange={onConstraintChange}
                            />
                        );
                    })
                ) : (
                    <Introduce />
                )}
            </StyledFilterGroup>
            <HandleGroup addRule={addRule} />
        </>
    );
};

export { FilterGroup };
