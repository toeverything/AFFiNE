import { OptionType, PendantIconConfig, PendantTypes } from '../types';
import type { RecastBlockValue, RecastMetaProperty } from '../../recast-block';
import { FunctionComponent } from 'react';

export type ModifyPanelProps = {
    type: PendantTypes | PendantTypes[];
    onSure: (type: PendantTypes, newPropertyItem: any, newValue: any) => void;
    onDelete?: (type: PendantTypes, value: any, propertyValue: any) => void;
    onCancel?: () => void;
    initialValue?: RecastBlockValue;
    initialOptions?: OptionType[];
    iconConfig?: PendantIconConfig;
    isStatusSelect?: boolean;
    property?: RecastMetaProperty;
};

export type ModifyPanelContentProps = {
    type: PendantTypes;
    onValueChange: (value: any) => void;
    onPropertyChange?: (newProperty: any) => void;
    initialValue?: RecastBlockValue;
    initialOptions?: OptionType[];
    iconConfig?: PendantIconConfig;
    isStatusSelect?: boolean;
    property?: RecastMetaProperty;
};
