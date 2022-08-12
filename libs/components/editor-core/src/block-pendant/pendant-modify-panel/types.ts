import { OptionType, PendantConfig, PendantTypes } from '../types';
import type { RecastBlockValue, RecastMetaProperty } from '../../recast-block';

export type ModifyPanelProps = {
    type: PendantTypes | PendantTypes[];
    onSure: (type: PendantTypes, newPropertyItem: any, newValue: any) => void;
    onDelete?: (type: PendantTypes, value: any, propertyValue: any) => void;
    onCancel?: () => void;
    initialValue?: RecastBlockValue;
    initialOptions?: OptionType[];
    iconConfig?: PendantConfig;
    isStatusSelect?: boolean;
    property?: RecastMetaProperty;
    onTypeChange?: (type: PendantTypes) => void;
};

export type ModifyPanelContentProps = {
    type: PendantTypes;
    onValueChange: (value: any) => void;
    onPropertyChange?: (newProperty: any) => void;
    initialValue?: RecastBlockValue;
    initialOptions?: OptionType[];
    iconConfig?: PendantConfig;
    isStatusSelect?: boolean;
    property?: RecastMetaProperty;
};
