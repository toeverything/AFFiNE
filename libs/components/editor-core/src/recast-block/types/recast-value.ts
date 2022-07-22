import { CSSProperties } from 'react';
import {
    RecastPropertyId,
    PropertyType,
    SelectOptionId,
} from './recast-property';

// Property Value

type BaseValue = {
    readonly id: RecastPropertyId;
};

export interface TextValue extends BaseValue {
    type: PropertyType.Text;
    value: string;
}

export interface DateValue extends BaseValue {
    type: PropertyType.Date;
    value: number | [number, number];
}

export interface SelectValue extends BaseValue {
    type: PropertyType.Select;
    value: SelectOptionId;
}

export interface MultiSelectValue extends BaseValue {
    type: PropertyType.MultiSelect;
    value: SelectOptionId[];
}

export interface MentionValue extends BaseValue {
    type: PropertyType.Mention;
    value: string;
}

export interface StatusValue extends BaseValue {
    type: PropertyType.Status;
    value: SelectOptionId;
}

export interface InformationValue extends BaseValue {
    type: PropertyType.Information;
    value: {
        phone: SelectOptionId[];
        location: SelectOptionId[];
        email: SelectOptionId[];
    };
}

// TODO add more value
export type RecastBlockValue =
    | TextValue
    | SelectValue
    | MultiSelectValue
    | StatusValue
    | DateValue
    | MentionValue
    | InformationValue;
