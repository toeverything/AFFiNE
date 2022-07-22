import { PANEL_CONFIG, SCENE_CONFIG } from './config';

export type ActivePanel = ValueOf<typeof PANEL_CONFIG | null>;
export type ActiveScene = ValueOf<typeof SCENE_CONFIG | null>;

export type Option = {
    key?: string;
    label?: string;
    value?: string;
};

/* closePanel */
export type ClosePanel = () => void;

export interface ViewItem {
    [key: string]: {
        id: number | string;
        value: boolean | number | string | string[];
        type: string;
        options?: Option[];
    };
}

export type ViewData = ViewItem[];

export interface OpRuleItem {
    key: string;
    value: string;
}

export type OpRule = OpRuleItem[];

export interface FilterGroupConstraintItemValue {
    checked: boolean;
    op: OpRuleItem['value'];
    value: string | string[] | unknown;
}

export type FilterGroupConstraint = Map<string, FilterGroupConstraintItemValue>;

export type SorterConstraint = Map<string, string>;

export type GroupData = {
    viewData: ViewData;
    filterGroupConstraint: FilterGroupConstraint;
    filterWeakSqlConstraint: string;
    sorterConstraint: SorterConstraint;
};

export type ValueOf<T> = T extends { [key: string]: infer V } ? V : never;
