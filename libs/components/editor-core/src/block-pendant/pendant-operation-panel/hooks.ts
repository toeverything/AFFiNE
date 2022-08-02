import type { CSSProperties } from 'react';
import {
    genSelectOptionId,
    type InformationProperty,
    type MultiSelectProperty,
    type RecastMetaProperty,
    type SelectOption,
    type SelectProperty,
    useRecastBlockMeta,
    useSelectProperty,
} from '../../recast-block';
import { type AsyncBlock } from '../../editor';
import { usePendant } from '../use-pendant';
import {
    type OptionType,
    PendantTypes,
    type TempInformationType,
} from '../types';
import {
    checkPendantForm,
    getOfficialSelected,
    getPendantConfigByType,
} from '../utils';
import { message } from '@toeverything/components/ui';

type SelectPropertyType = MultiSelectProperty | SelectProperty;
type SureParams = {
    fieldName: string;
    type: PendantTypes;
    newPropertyItem: any;
    newValue: any;
};

const genOptionWithId = (options: OptionType[] = []) => {
    return options.map((option: OptionType) => ({
        ...option,
        id: genSelectOptionId(),
    }));
};
// Callback function for pendant create
export const useOnCreateSure = ({ block }: { block: AsyncBlock }) => {
    const { addProperty } = useRecastBlockMeta();
    const { createSelect } = useSelectProperty();
    const { setPendant } = usePendant(block);

    return async ({
        type,
        fieldName,
        newPropertyItem,
        newValue,
    }: SureParams) => {
        const checkResult = checkPendantForm(
            type,
            fieldName,
            newPropertyItem,
            newValue
        );

        if (!checkResult.passed) {
            await message.error(checkResult.message);
            return;
        }

        if (
            type === PendantTypes.MultiSelect ||
            type === PendantTypes.Select ||
            type === PendantTypes.Status
        ) {
            const newProperty = await createSelect({
                name: fieldName,
                options: newPropertyItem,
                type,
            });

            const selectedId = getOfficialSelected({
                isMulti: type === PendantTypes.MultiSelect,
                options: newProperty.options,
                tempOptions: newPropertyItem,
                tempSelectedId: newValue,
            });

            await setPendant(newProperty, selectedId);
        } else if (type === PendantTypes.Information) {
            const emailOptions = genOptionWithId(newPropertyItem.emailOptions);

            const phoneOptions = genOptionWithId(newPropertyItem.phoneOptions);

            const locationOptions = genOptionWithId(
                newPropertyItem.locationOptions
            );

            const newProperty = await addProperty({
                type,
                name: fieldName,
                emailOptions,
                phoneOptions,
                locationOptions,
            } as Omit<InformationProperty, 'id'>);

            await setPendant(newProperty, {
                email: getOfficialSelected({
                    isMulti: true,
                    options: emailOptions,
                    tempOptions: newPropertyItem.emailOptions,
                    tempSelectedId: newValue.email,
                }),
                phone: getOfficialSelected({
                    isMulti: true,
                    options: phoneOptions,
                    tempOptions: newPropertyItem.phoneOptions,
                    tempSelectedId: newValue.phone,
                }),
                location: getOfficialSelected({
                    isMulti: true,
                    options: locationOptions,
                    tempOptions: newPropertyItem.locationOptions,
                    tempSelectedId: newValue.location,
                }),
            });
        } else {
            // TODO: Color and background should use pendant config, but ui is not design now
            const iconConfig = getPendantConfigByType(type);
            // TODO: Color and background should be choose by user in the future
            const newProperty = await addProperty({
                type: type,
                name: fieldName,
                background:
                    iconConfig.background as CSSProperties['background'],
                color: iconConfig.color as CSSProperties['color'],
                iconName: iconConfig.iconName,
            });

            await setPendant(newProperty, newValue);
        }
    };
};

// Callback function for pendant update
export const useOnUpdateSure = ({
    block,
    property,
}: {
    block: AsyncBlock;
    property: RecastMetaProperty;
}) => {
    const { updateSelect } = useSelectProperty();
    const { setPendant } = usePendant(block);
    const { updateProperty } = useRecastBlockMeta();

    return async ({
        type,
        fieldName,
        newPropertyItem,
        newValue,
    }: SureParams) => {
        const checkResult = checkPendantForm(
            type,
            fieldName,
            newPropertyItem,
            newValue
        );

        if (!checkResult.passed) {
            await message.error(checkResult.message);
            return;
        }

        if (
            type === PendantTypes.MultiSelect ||
            type === PendantTypes.Select ||
            type === PendantTypes.Status
        ) {
            const newOptions = newPropertyItem as OptionType[];
            let selectProperty = property as SelectPropertyType;
            const deleteOptionIds = selectProperty.options
                .filter(o => {
                    return !newOptions.find(no => no.id === o.id);
                })
                .map(o => o.id);
            const addOptions = newOptions.filter(o => typeof o.id === 'number');

            const { addSelectOptions, removeSelectOptions } =
                updateSelect(selectProperty);

            deleteOptionIds.length &&
                (selectProperty = (await removeSelectOptions(
                    ...deleteOptionIds
                )) as SelectPropertyType);

            addOptions.length &&
                (selectProperty = (await addSelectOptions(
                    ...(addOptions as unknown as Omit<SelectOption, 'id'>[])
                )) as SelectPropertyType);

            const selectedId = getOfficialSelected({
                isMulti: type === PendantTypes.MultiSelect,
                options: selectProperty.options,
                tempOptions: newPropertyItem,
                tempSelectedId: newValue,
            });

            await setPendant(selectProperty, selectedId);
        } else if (type === PendantTypes.Information) {
            // const { emailOptions, phoneOptions, locationOptions } =
            //     property as InformationProperty;
            const optionGroup = newPropertyItem as TempInformationType;

            const emailOptions = optionGroup.emailOptions.map(option => {
                if (typeof option.id === 'number') {
                    option.id = genSelectOptionId();
                }
                return option;
            });
            const phoneOptions = optionGroup.phoneOptions.map(option => {
                if (typeof option.id === 'number') {
                    option.id = genSelectOptionId();
                }
                return option;
            });
            const locationOptions = optionGroup.locationOptions.map(option => {
                if (typeof option.id === 'number') {
                    option.id = genSelectOptionId();
                }
                return option;
            });

            const newProperty = await updateProperty({
                ...property,
                emailOptions,
                phoneOptions,
                locationOptions,
            } as InformationProperty);

            await setPendant(newProperty, {
                email: getOfficialSelected({
                    isMulti: true,
                    options: emailOptions as SelectOption[],
                    tempOptions: newPropertyItem.emailOptions,
                    tempSelectedId: newValue.email,
                }),
                phone: getOfficialSelected({
                    isMulti: true,
                    options: phoneOptions as SelectOption[],
                    tempOptions: newPropertyItem.phoneOptions,
                    tempSelectedId: newValue.phone,
                }),
                location: getOfficialSelected({
                    isMulti: true,
                    options: locationOptions as SelectOption[],
                    tempOptions: newPropertyItem.locationOptions,
                    tempSelectedId: newValue.location,
                }),
            });
        } else {
            await setPendant(property, newValue);
        }

        if (fieldName !== property.name) {
            await updateProperty({
                ...property,
                name: fieldName,
            });
        }
    };
};
