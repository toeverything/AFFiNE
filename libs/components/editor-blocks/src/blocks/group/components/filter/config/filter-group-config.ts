/* filter item onChange types */
const FILTER_GROUP_CHANGE_TYPES = {
    RULE_ADD: 'rule_add',
    RULE_DELETE: 'rule_delete',
    CHECK_CHANGE: 'check_change',
    KEY_CHANGE: 'key_change',
    OP_CHANGE: 'op_change',
    VALUE_CHANGE: 'value_change',
} as const;

/* filter rule config */
const FILTER_RULE_CONFIG = {
    include: {
        label: 'includes',
        value: 'includes1',
    },
    exclude: {
        label: 'excludes',
        value: 'excludes2',
    },
    gt: {
        label: '>',
        value: '>1',
    },
    lt: {
        label: '<',
        value: '<1',
    },
    eq: {
        label: '=',
        value: '=1',
    },
    gte: {
        label: '>=',
        value: '>=1',
    },
    lte: {
        label: '<=',
        value: '<=1',
    },
    null: {
        label: 'is null',
        value: 'is null1',
    },
    notNull: {
        label: 'is not null',
        value: 'is not null1',
    },
    between: {
        label: 'between',
        value: 'between',
    },
};

/* rule Map for defaultValue or compare */
const ruleMap = new Map([
    [
        'content',
        {
            include: FILTER_RULE_CONFIG.include,
            exclude: FILTER_RULE_CONFIG.exclude,
        },
    ],
    ['boolean', { eq: FILTER_RULE_CONFIG.eq }],
]);

export { FILTER_RULE_CONFIG, FILTER_GROUP_CHANGE_TYPES, ruleMap };
