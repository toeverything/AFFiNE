import type { Constraint, Relation } from './types';

/**
 * pick valid information in v
 * @param v
 * @returns {number|string}
 */
const pickValue = (v: string) => {
    /* pick legal value: number */
    if (!isNaN(Number(v))) {
        return Number(v);
    }

    /* pick legal value: string | string[] | number[] */
    try {
        const set = v.match(/["|'](.*)["|']/)[1].split(',');

        if (set.length === 1) {
            /* string */
            return set[0];
        }

        /* string[] */
        return set;
    } catch (e) {
        /* number[] */
        return v.split(',').map(Number);
    }
};

/**
 * make weak-sql str to weak-constraint
 * @param weak_sql_express
 * @return Promise<Constraint[]>
 */
const weakSqlCreator = (weak_sql_express = ''): Promise<Constraint[]> => {
    const weak_sql_pattern =
        /[^;&&;&]+(>|<|=|>=|<=|includes|excludes|is null)[^;&&;&]*(&&|&|;)?/gim;
    const relation_pattern = /(>=|<=|>|<|=|includes|excludes|is null)/gim;

    return new Promise((resolve, reject) => {
        const constraints: Constraint[] = [];

        try {
            weak_sql_express.replace(weak_sql_pattern, weak_sql_str => {
                const [relation] = weak_sql_str.match(relation_pattern);
                const [field, value] = weak_sql_str.split(relation);

                constraints.push({
                    field: field.trim(),
                    relation: relation.trim() as Relation,
                    value: pickValue(value.replace(/&&|&|;/, '').trim()),
                });

                /* meaningless return value */
                return '';
            });

            resolve(constraints);
        } catch (e) {
            reject(e);
        }
    });
};

export { weakSqlCreator };
