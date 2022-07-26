import type { ReactElement, CSSProperties } from 'react';
import {
    PropertyType as PendantTypes,
    SelectOption,
    SelectOptionId,
} from '../recast-block';
import { FunctionComponent } from 'react';
import { TextFontIcon } from '@toeverything/components/icons';

export { PropertyType as PendantTypes } from '../recast-block';

export enum IconNames {
    TEXT = 'text',
    DATE = 'date',
    STATUS = 'status',
    MULTI_SELECT = 'multiSelect',
    SINGLE_SELECT = 'singleSelect',
    COLLABORATOR = 'collaborator',
    INFORMATION = 'information',
    PHONE = 'phone',
    LOCATION = 'location',
    EMAIL = 'email',
}

export type BasicPendantOption = {
    type: PendantTypes | PendantTypes[];
    name: string;
};

export type PendantOptions = {
    name: string;
    type: PendantTypes;
    iconName: IconNames;
    subTitle: string;
};

export type PendantConfig = {
    iconName: IconNames;
    // background: CSSProperties['background'];
    // color: CSSProperties['color'];
    background: CSSProperties['background'] | CSSProperties['background'][];
    color: CSSProperties['color'] | CSSProperties['color'][];
};

export type OptionIdType = SelectOptionId | number;
export type OptionType = Omit<SelectOption, 'id'> & {
    id: OptionIdType;
};

export type TempInformationType = {
    phoneOptions: OptionType[];
    locationOptions: OptionType[];
    emailOptions: OptionType[];
};
