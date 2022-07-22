export type ConstraintKey = string;

export type Constraint = {
    field: ConstraintKey;
    rule: string;
};

export type SorterConstraint = Constraint[];

export type Constraints = Map<ConstraintKey, Constraint>;

export type Option = {
    key?: string;
    label?: string;
    value?: string;
};

export type OnConstraintChange = (params: {
    oldField?: string;
    newField?: string;
    newRule?: string;
}) => void;

export interface SorterItemProps {
    constraint: [ConstraintKey, Constraint];
    constraints: Constraints;
    fieldOptions: Option[];
    ruleOptions: Option[];
    onConstraintChange: OnConstraintChange;
}
