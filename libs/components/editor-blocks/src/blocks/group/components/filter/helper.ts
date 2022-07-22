import type { FilterConstraint, FilterConstraintMap } from './types';

const makeFilterConstraint2Map = (filterConstraint: FilterConstraint = []) =>
    filterConstraint.reduce<FilterConstraintMap>(
        (m, current) => m.set(current.key, current),
        new Map()
    );

export { makeFilterConstraint2Map };
