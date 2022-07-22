import { MODE_CONFIG } from './config/filter-mode-config';
import type { ValueOf } from '../../types';
import type { Column } from '@toeverything/datasource/db-service';
import type { AsyncBlock } from '@toeverything/framework/virgo';

export type ConstraintKey = string;

export type MultipleValue = {
    title?: string;
    label?: string;
    value?: string | boolean;
};

export type Constraint = {
    key: ConstraintKey;
    checked: boolean;
    type: string;
    fieldValue: string;
    opSelectValue: string;
    valueSelectValue: string | string[] | MultipleValue[];
};

export type FilterConstraint = Constraint[];

export type FilterConstraintMap = Map<ConstraintKey, Constraint>;

export type OnConstraintChange = (params: {
    type: string;
    deleteKey?: string;
    newData?: [ConstraintKey, Constraint];
}) => void;

export type ValueOption = MultipleValue;

export interface SorterItemProps {
    constraint: [ConstraintKey, Constraint];
    constraints: FilterConstraintMap;
    fieldOptions: Column[];
    valueOptions?: ValueOption[];
    onConstraintChange: OnConstraintChange;
}

export interface CheckboxProps {
    value: boolean;
    onChange: () => void;
}

export type PanelMode = ValueOf<typeof MODE_CONFIG>;

export interface Context {
    mode: PanelMode;
    switchMode: () => void;
    makeView: () => void;
    block: AsyncBlock;
}
