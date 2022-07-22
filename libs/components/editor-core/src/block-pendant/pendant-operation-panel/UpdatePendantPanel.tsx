import React from 'react';
import { PendantModifyPanel } from '../pendant-modify-panel';
import type { AsyncBlock } from '../../editor';
import {
    genSelectOptionId,
    InformationProperty,
    type MultiSelectProperty,
    type RecastBlockValue,
    type RecastMetaProperty,
    type SelectOption,
    type SelectProperty,
    useRecastBlockMeta,
    useSelectProperty,
} from '../../recast-block';
import { OptionType, PendantTypes, TempInformationType } from '../types';
import {
    getOfficialSelected,
    getPendantIconsConfigByType,
    // getPendantIconsConfigByNameOrType,
} from '../utils';
import { usePendant } from '../use-pendant';
import {
    StyledPopoverWrapper,
    StyledOperationTitle,
    StyledOperationLabel,
    StyledInputEndAdornment,
    StyledDivider,
    StyledPopoverContent,
    StyledPopoverSubTitle,
} from '../StyledComponent';
import { IconMap, pendantOptions } from '../config';

type SelectPropertyType = MultiSelectProperty | SelectProperty;

type Props = {
    value: RecastBlockValue;
    property: RecastMetaProperty;
    block: AsyncBlock;
    hasDelete?: boolean;
    onSure?: () => void;
    onCancel?: () => void;
};

export const UpdatePendantPanel = ({
    value,
    property,
    block,
    hasDelete = false,
    onSure,
    onCancel,
}: Props) => {
    const { updateSelect } = useSelectProperty();
    const { setPendant, removePendant } = usePendant(block);
    const pendantOption = pendantOptions.find(v => v.type === property.type);
    const iconConfig = getPendantIconsConfigByType(property.type);
    const Icon = IconMap[iconConfig.name];
    const { updateProperty } = useRecastBlockMeta();

    return (
        <StyledPopoverWrapper>
            <StyledOperationLabel>Field Type</StyledOperationLabel>
            <StyledPopoverContent>
                <Icon
                    style={{
                        fontSize: 20,
                        marginRight: 12,
                        color: '#98ACBD',
                    }}
                />
                {property.type}
            </StyledPopoverContent>
            <StyledOperationLabel>Field Title</StyledOperationLabel>
            <StyledPopoverContent>{property.name}</StyledPopoverContent>
            <StyledDivider />
            {pendantOption.subTitle && (
                <StyledPopoverSubTitle>
                    {pendantOption.subTitle}
                </StyledPopoverSubTitle>
            )}
            <PendantModifyPanel
                initialValue={
                    {
                        type: value.type,
                        value: value.value,
                    } as RecastBlockValue
                }
                iconConfig={getPendantIconsConfigByType(property.type)}
                property={property}
                type={property.type}
                onSure={async (type, newPropertyItem, newValue) => {
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
                        const addOptions = newOptions.filter(
                            o => typeof o.id === 'number'
                        );

                        const { addSelectOptions, removeSelectOptions } =
                            updateSelect(selectProperty);

                        deleteOptionIds.length &&
                            (selectProperty = (await removeSelectOptions(
                                ...deleteOptionIds
                            )) as SelectPropertyType);

                        addOptions.length &&
                            (selectProperty = (await addSelectOptions(
                                ...(addOptions as unknown as Omit<
                                    SelectOption,
                                    'id'
                                >[])
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
                        const optionGroup =
                            newPropertyItem as TempInformationType;

                        const emailOptions = optionGroup.emailOptions.map(
                            option => {
                                if (typeof option.id === 'number') {
                                    option.id = genSelectOptionId();
                                }
                                return option;
                            }
                        );
                        const phoneOptions = optionGroup.phoneOptions.map(
                            option => {
                                if (typeof option.id === 'number') {
                                    option.id = genSelectOptionId();
                                }
                                return option;
                            }
                        );
                        const locationOptions = optionGroup.locationOptions.map(
                            option => {
                                if (typeof option.id === 'number') {
                                    option.id = genSelectOptionId();
                                }
                                return option;
                            }
                        );

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

                    onSure?.();
                }}
                onDelete={
                    hasDelete
                        ? async () => {
                              await removePendant(property);
                          }
                        : null
                }
                onCancel={onCancel}
            />
        </StyledPopoverWrapper>
    );
};
