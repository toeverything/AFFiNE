import type { SorterItemProps } from './filter/types';
import type { FilterGroupConstraint } from '../types';
import { BooleanColumn } from '@toeverything/datasource/db-service';

/**
 * filter module: adapt multiple selection scenarios
 * @param nativeData
 */
const getOptionsFromNativeData = (
    nativeData: Omit<SorterItemProps, 'onConstraintChange'>
) => {
    const {
        constraint: [key, { fieldValue }],
        fieldOptions,
        constraints,
    } = nativeData;

    const valueOptions = (
        fieldOptions.filter(item => item.key === key)[0] as BooleanColumn
    )?.options?.map(({ name, value }) => ({ title: name, value }));

    /* options: contains current and unselected*/
    const effectiveOptions = fieldOptions
        .map(item => {
            const { key, name } = item;
            return {
                ...item,
                label: name,
                value: key,
            };
        })
        .filter(item => {
            return !constraints.has(item.value) || item.value === fieldValue;
        });

    return {
        fieldOptions: effectiveOptions,
        valueOptions,
    };
};

/**
 * translate
 * @param constraints
 */
const constraints2FilterSchema = (constraints: FilterGroupConstraint) => {
    return [...constraints.entries()]
        .filter(constraint => constraint[1].checked)
        .map(([field, { op, value }]) => ({ field, op, value }));
};

export { getOptionsFromNativeData, constraints2FilterSchema };
