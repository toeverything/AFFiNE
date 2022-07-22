export const compareRules = new Map([
    ['>', '$gt'] /* example: { field: {$gt: null} } */,
    ['<', '$lt'],
    ['=', '$eq'],
    ['>=', '$gte'],
    ['<=', '$lte'],

    ['includes', '$in'] /* example: { field: {$in: [1, 2, 3]} } */,
    ['excludes', '$nin'],
]);

/* example: { field: {}} */
export const nullRules = new Map([
    ['is null', { $ne: null }],
    ['is not null', { $exists: true }],
]);
