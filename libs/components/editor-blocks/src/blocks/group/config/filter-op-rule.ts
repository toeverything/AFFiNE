/* op rule for filter group */
import { OpRule } from '../types';

export const FILTER_OP_RULE_CONFIG: OpRule = [
    {
        key: 'includes',
        value: 'includes1',
    },
    {
        key: 'excludes',
        value: 'excludes2',
    },
    {
        key: '>',
        value: '>1',
    },
    {
        key: '<',
        value: '<1',
    },
    {
        key: '=',
        value: '=1',
    },
    {
        key: '>=',
        value: '>=1',
    },
    {
        key: '<=',
        value: '<=1',
    },
    {
        key: 'is null',
        value: 'is null1',
    },
    {
        key: 'is not null',
        value: 'is not null1',
    },
];
