import { styled } from '@toeverything/components/ui';
import { AddViewIcon } from '@toeverything/components/icons';
import { Introduce } from './Introduce';
import { SorterItem } from './SorterItem';
import { SORTER_CONFIG } from './config';
import { makesSorterConstraint2Map } from './helper';
import type { Column } from '@toeverything/datasource/db-service';
import type {
    Constraint,
    ConstraintKey,
    Constraints,
    OnConstraintChange,
} from './types';
import type { AsyncBlock } from '@toeverything/framework/virgo';

const StyledSorterItems = styled('div')({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '32px 0',
});

const StyledAddSort = styled('div')({
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    '& svg': {
        marginRight: 4,
    },
    fontSize: 12,
    color: '#3A4C5C',
});

const SorterSelector = ({ block }: { block: AsyncBlock }) => {
    const sorterConstraintMap = makesSorterConstraint2Map(
        block.getProperties()?.sorterConstraint || []
    );

    const fieldOptions = (block.columns as Column[])
        .filter(item => {
            if ('sorter' in item) {
                return !!item['sorter'];
            }

            return false;
        })
        .map(item => {
            const { name, key } = item;

            return { key, label: name };
        });

    /**
     * sort constraint change
     * @param constraints
     */
    const onConstraintChange: OnConstraintChange = async ({
        oldField,
        newField,
        newRule,
    }) => {
        const newSorterConstraintMap: Constraints = new Map([
            ...sorterConstraintMap.entries(),
        ]);
        /* delete */
        oldField && newSorterConstraintMap.delete(oldField);
        /* update or add */
        /* maybe bug: when updated, item's position will change */
        newField &&
            newSorterConstraintMap.set(newField, {
                field: newField,
                rule: newRule,
            });

        await block.setProperties({
            sorterConstraint: Array.from(newSorterConstraintMap.values()),
        });
    };

    /**
     * add new sort item
     */
    const addSort = () => {
        for (const option of fieldOptions) {
            if (!sorterConstraintMap.has(option.key)) {
                onConstraintChange({
                    newField: option.key,
                    newRule: SORTER_CONFIG.ASC.value,
                });
                return;
            }
        }
    };

    /* translate Map to Array for render */
    const constraintList: Array<[ConstraintKey, Constraint]> = Array.from(
        sorterConstraintMap.entries()
    );

    return (
        <>
            <StyledSorterItems>
                {!constraintList.length ? (
                    <Introduce />
                ) : (
                    constraintList.map(constraint => (
                        <SorterItem
                            key={constraint[0]}
                            constraint={constraint}
                            constraints={sorterConstraintMap}
                            fieldOptions={fieldOptions}
                            ruleOptions={Object.values(SORTER_CONFIG)}
                            onConstraintChange={onConstraintChange}
                        />
                    ))
                )}
            </StyledSorterItems>

            <StyledAddSort onClick={addSort}>
                <AddViewIcon fontSize="small" />
                <span>Add new sort</span>
            </StyledAddSort>
        </>
    );
};

export { SorterSelector };
