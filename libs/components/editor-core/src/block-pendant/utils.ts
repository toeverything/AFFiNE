import {
    PropertyType,
    RecastBlockValue,
    RecastPropertyId,
    SelectOption,
} from '../recast-block';
import { OptionIdType, OptionType } from './types';
import { pendantConfig } from './config';
import { PendantConfig, PendantTypes } from './types';
type Props = {
    recastBlockId: string;
    blockId: string;
    propertyId: RecastPropertyId;
};

type StorageMap = {
    [recastBlockId: string]: {
        [propertyId: RecastPropertyId]: string;
    };
};

const LOCAL_STORAGE_NAME = 'TEMPORARY_PENDANT_DATA';

const ensureLocalStorage = () => {
    const data = localStorage.getItem(LOCAL_STORAGE_NAME);
    if (!data) {
        localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify({}));
    }
};

export const setPendantHistory = ({
    recastBlockId,
    blockId,
    propertyId,
}: Props) => {
    ensureLocalStorage();
    const data: StorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );

    if (!data[recastBlockId]) {
        data[recastBlockId] = {};
    }
    const propertyValueRecord = data[recastBlockId];
    propertyValueRecord[propertyId] = blockId;

    localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify(data));
};

export const getPendantHistory = ({
    recastBlockId,
}: {
    recastBlockId: string;
}) => {
    ensureLocalStorage();
    const data: StorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );

    return data[recastBlockId] ?? {};
};

export const removePropertyValueRecord = ({
    recastBlockId,
    propertyId,
}: {
    recastBlockId: string;
    propertyId: RecastPropertyId;
}) => {
    ensureLocalStorage();
    const data: StorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );
    if (!data[recastBlockId]) {
        return;
    }

    delete data[recastBlockId][propertyId];

    localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify(data));
};

/**
 * In select pendant panel, use mock options instead of use `createSelect` when add or delete option
 * so the option`s id is index number, not `SelectOptionId`
 * need to convert index number to id when Select is created and set selected
 *
 * 1. find index in mock options
 * 2. find generated options for index
 *
 * **/
export const getOfficialSelected = ({
    isMulti,
    options,
    tempSelectedId,
    tempOptions,
}: {
    isMulti: boolean;
    options: SelectOption[];
    tempSelectedId: OptionIdType | OptionIdType[];
    tempOptions: OptionType[];
}) => {
    let selectedId: string | string[] = isMulti ? [] : '';

    if (isMulti) {
        const selectedIndex = (tempSelectedId as OptionIdType[])
            .map(id => {
                return tempOptions.findIndex((o: OptionType) => o.id === id);
            })
            .filter(index => index != -1);
        selectedId = selectedIndex.map((index: number) => {
            return options[index].id;
        });
    } else {
        const selectedIndex = tempOptions.findIndex(
            (o: OptionType) => o.id === tempSelectedId
        );
        selectedId = options[selectedIndex]?.id || '';
    }
    return selectedId;
};

export const getPendantConfigByType = (pendantType: string): PendantConfig => {
    return pendantConfig[pendantType];
};

export const getPendantIconsConfigByName = (
    pendantName?: string
): PendantConfig => {
    return pendantConfig[pendantName];
};

export const genBasicOption = ({
    index,
    iconConfig,
    name = '',
}: {
    index: number;
    iconConfig: PendantConfig;
    name?: string;
}): OptionType => {
    const iconName = iconConfig.iconName;
    const background = Array.isArray(iconConfig.background)
        ? iconConfig.background[index % iconConfig.background.length]
        : iconConfig.background;
    const color = Array.isArray(iconConfig.color)
        ? iconConfig.color[index % iconConfig.color.length]
        : iconConfig.color;

    return {
        id: index,
        name,
        color,
        background,
        iconName,
    };
};

/**
 * Status Pendant is a Select Pendant built-in some options
 * **/
export const genInitialOptions = (
    type: PendantTypes,
    iconConfig: PendantConfig
) => {
    if (type === PendantTypes.Status) {
        return [
            genBasicOption({ index: 0, iconConfig, name: 'No Started' }),
            genBasicOption({
                index: 1,
                iconConfig,
                name: 'In Progress',
            }),
            genBasicOption({ index: 2, iconConfig, name: 'Complete' }),
        ];
    }
    return [genBasicOption({ index: 0, iconConfig })];
};

export const checkPendantForm = (
    type: PropertyType,
    fieldTitle: string,
    newProperty: any,
    newValue: any
): { passed: boolean; message: string } => {
    if (!fieldTitle) {
        return { passed: false, message: 'The field title cannot be empty !' };
    }

    if (
        type === PendantTypes.MultiSelect ||
        type === PendantTypes.Select ||
        type === PendantTypes.Status
    ) {
        if (!newProperty) {
            return {
                passed: false,
                message: 'Ensure at least one non-empty option !',
            };
        }
    }
    if (type === PendantTypes.Information) {
        if (!newProperty) {
            return {
                passed: false,
                message: 'Ensure at least one non-empty option !',
            };
        }
    }
    if (
        type === PendantTypes.Text ||
        type === PendantTypes.Date ||
        type === PendantTypes.Mention
    ) {
        if (!newValue) {
            return {
                passed: false,
                message: `The content of the input must not be empty !`,
            };
        }
    }

    return { passed: true, message: 'Check passed !' };
};
