import type { Constraint, Constraints } from './types';

const makesSorterConstraint2Map = (sorterConstraint: Constraint[] = []) =>
    sorterConstraint.reduce<Constraints>(
        (m, cur) => m.set(cur.field, cur),
        new Map()
    );

export { makesSorterConstraint2Map };
