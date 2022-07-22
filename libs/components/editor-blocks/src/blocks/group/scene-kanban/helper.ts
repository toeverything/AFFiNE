import { DEFAULT_COLUMN_KEYS } from '@toeverything/datasource/db-service';
import { SORTER_CONFIG } from '../components/sorter/config';
import { FILTER_RULE_CONFIG } from '../components/filter/config/filter-group-config';
import type { KanbanGroup } from '@toeverything/components/editor-core';
import type {
    FilterConstraint,
    MultipleValue,
} from '../components/filter/types';
import type { SorterConstraint } from '../components/sorter/types';
import type { DefaultColumnsValue } from '@toeverything/datasource/db-service';

/**
 * TODO: Grayscale configuration
 */

const filter = (
    kanban: KanbanGroup[],
    filterConstraint: FilterConstraint = []
) => {
    return kanban.map(panel => {
        const cards = panel.items;

        const effectiveCards = cards.filter(card => {
            const properties =
                card.block.getProperties() as unknown as DefaultColumnsValue;

            const validRes = filterConstraint.map(constraint => {
                const { key, opSelectValue, valueSelectValue } = constraint;

                /* filter constraint has no value, no filter */ if (
                    !valueSelectValue ||
                    !valueSelectValue.length
                ) {
                    return true;
                }

                /* For the time being, only content and checked need to be filtered, and you can continue to add policies in the future */
                if (key === DEFAULT_COLUMN_KEYS.Text) {
                    if (key in properties) {
                        const textValue = properties?.[key]?.value
                            .reduce((res, current) => res + current.text, '')
                            .toLowerCase();
                        const isContainer = textValue.includes(
                            (valueSelectValue as string).trim()
                        );
                        if (
                            opSelectValue === FILTER_RULE_CONFIG.include.value
                        ) {
                            return isContainer;
                        }

                        return !isContainer;
                    }
                }

                if (key === DEFAULT_COLUMN_KEYS.Checked) {
                    /* selected all */
                    if (valueSelectValue.length === 2) {
                        return true;
                    }

                    if (opSelectValue === FILTER_RULE_CONFIG.eq.value) {
                        return (
                            (properties[key]?.value || false) ===
                            (valueSelectValue[0] as MultipleValue).value
                        );
                    }

                    return !(
                        (properties[key]?.value || false) ===
                        (valueSelectValue[0] as MultipleValue).value
                    );
                }

                /* If the card has neither content nor checked, then filter it out directly */
                return false;
            });

            const isValid = !validRes.some(item => item === false);

            return isValid;
        });

        return {
            ...panel,
            items: effectiveCards,
        };
    });
};

const sorter = (kanban: KanbanGroup[], sorterConstraint: SorterConstraint) => {
    return kanban.map(cardPanel => {
        let cards = cardPanel.items;

        /* The data is divided into three categories: checked is true; checked is false; no checked */
        for (const constraint of sorterConstraint) {
            const { field, rule } = constraint;
            if (field === 'checked') {
                const checkedData = [];
                const unCheckedData = [];
                const noCheckedData = [];

                for (const card of cards) {
                    const properties =
                        card.block.getProperties() as unknown as DefaultColumnsValue;
                    const checked = properties[field]?.value;

                    if (checked === true) {
                        checkedData.push(card);
                    } else if (checked === false) {
                        unCheckedData.push(card);
                    } else {
                        noCheckedData.push(card);
                    }
                }

                if (rule === SORTER_CONFIG.ASC.value) {
                    cards = [].concat(
                        checkedData,
                        unCheckedData,
                        noCheckedData
                    );
                } else {
                    cards = [].concat(
                        unCheckedData,
                        checkedData,
                        noCheckedData
                    );
                }
            }
        }

        return {
            ...cardPanel,
            items: cards,
        };
    });
};

export { filter, sorter };
