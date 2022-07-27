import { CSSProperties } from 'react';
import {
    META_CURRENT_VIEW_ID_KEY,
    META_PROPERTIES_KEY,
    META_VIEWS_KEY,
} from './constant';
import { RecastView, RecastViewId } from './view';

// ---------------------------------------------------
// Property

export enum PropertyType {
    Text = 'text',
    Status = 'status',
    Select = 'select',
    MultiSelect = 'multiSelect',
    Date = 'date',
    Mention = 'mention',
    Information = 'information',
}

export type RecastPropertyId = string & {
    /**
     * Type differentiator only.
     */
    readonly __isPropertyId: true;
};

interface BaseProperty {
    readonly id: RecastPropertyId;
    name: string;
    background?: CSSProperties['background'];
    color?: CSSProperties['color'];
    iconName?: string;
}

export interface TextProperty extends BaseProperty {
    type: PropertyType.Text;
}

export interface DateProperty extends BaseProperty {
    type: PropertyType.Date;
}

export interface MentionProperty extends BaseProperty {
    type: PropertyType.Mention;
}

export type SelectOptionId = string & {
    /**
     * Type differentiator only.
     */
    readonly __isSelectOptionId: true;
};

export interface SelectOption {
    id: SelectOptionId;
    name: string;
    // value: string;
    color?: CSSProperties['color'];
    background?: CSSProperties['background'];
    iconName?: string;
}

export interface StatusProperty extends BaseProperty {
    type: PropertyType.Status;
    options: SelectOption[];
}

/**
 * Select
 */
export interface SelectProperty extends BaseProperty {
    type: PropertyType.Select;
    options: SelectOption[];
}

/**
 * MultiSelect
 *
 * TODO pending for further evaluation
 */
export interface MultiSelectProperty extends BaseProperty {
    type: PropertyType.MultiSelect;
    options: SelectOption[];
    /**
     * Limit the number of choices, if it is 1, it is a single choice
     * @deprecated pending for further evaluation
     */
    multiple?: number;
}

export interface InformationProperty extends BaseProperty {
    type: PropertyType.Information;
    phoneOptions: SelectOption[];
    locationOptions: SelectOption[];
    emailOptions: SelectOption[];
}
// TODO add more value
export type RecastMetaProperty =
    | TextProperty
    | SelectProperty
    | MultiSelectProperty
    | DateProperty
    | MentionProperty
    | StatusProperty
    | InformationProperty;

/**
 * @deprecated Use {@link META_VIEWS_KEY} instead.
 */
const KANBAN_PROPERTIES_KEY = 'kanbanProps' as const;

export type RecastDataProperties = Partial<{
    /**
     * PLEASE DO NOT USE IT
     * @deprecated Use {@link RecastView} instead
     */
    scene?: undefined;
    /**
     * PLEASE DO NOT USE IT
     * @deprecated Use {@link RecastView} instead
     */
    [KANBAN_PROPERTIES_KEY]?: undefined;

    [META_PROPERTIES_KEY]: RecastMetaProperty[];
    [META_VIEWS_KEY]: RecastView[];
    [META_CURRENT_VIEW_ID_KEY]: RecastViewId;
}>;
