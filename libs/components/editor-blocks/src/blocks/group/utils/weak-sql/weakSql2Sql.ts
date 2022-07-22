import { compareRules, nullRules } from './rule-config';
import { weakSqlCreator } from './weakSqlCreator';

/**
 * weakSql to sql
 * @param weakSqlExpress
 */
const weakSql2Sql = async (weakSqlExpress = '') => {
    const weakConstraints = await weakSqlCreator(weakSqlExpress);

    const constraints = weakConstraints.map(weakConstraint => {
        const { field, relation, value } = weakConstraint;

        if (!compareRules.has(relation) && !nullRules.has(relation)) {
            return {};
        }

        const rule = (compareRules.get(relation) ||
            nullRules.get(relation)) as string;

        return {
            [field]: {
                [rule]: compareRules.has(relation)
                    ? value
                    : nullRules.get(relation),
            },
        };
    });

    return {
        $and: constraints,
    };
};

export { weakSql2Sql, weakSqlCreator };
