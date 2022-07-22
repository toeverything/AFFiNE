/* sql relation type */
export type Relation =
    | '>'
    | '<'
    | '='
    | '>='
    | '<='
    | 'is null'
    | 'is not null'
    | 'includes'
    | 'excludes';

/* single weak sql type */
export interface Constraint {
    field: string;
    relation: Relation;
    value: unknown;
}
