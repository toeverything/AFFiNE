import React, { CSSProperties, useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { Input, Option, Select, Tooltip } from '@toeverything/components/ui';
import { HelpCenterIcon } from '@toeverything/components/icons';
import { AsyncBlock } from '../../editor';

import { IconMap, pendantOptions } from '../config';
import { OptionType, PendantOptions, PendantTypes } from '../types';
import { PendantModifyPanel } from '../pendant-modify-panel';
import {
    StyledDivider,
    StyledInputEndAdornment,
    StyledOperationLabel,
    StyledOperationTitle,
    StyledPopoverSubTitle,
    StyledPopoverWrapper,
} from '../StyledComponent';
import {
    genSelectOptionId,
    InformationProperty,
    useRecastBlock,
    useRecastBlockMeta,
    useSelectProperty,
} from '../../recast-block';
import {
    genInitialOptions,
    getOfficialSelected,
    getPendantConfigByType,
} from '../utils';
import { usePendant } from '../use-pendant';

const upperFirst = (str: string) => {
    return `${str[0].toUpperCase()}${str.slice(1)}`;
};
export const CreatePendantPanel = ({
    block,
    onSure,
}: {
    block: AsyncBlock;
    onSure?: () => void;
}) => {
    const [selectedOption, setSelectedOption] = useState<PendantOptions>();
    const [fieldName, setFieldName] = useState<string>('');
    const { addProperty, removeProperty } = useRecastBlockMeta();
    const { createSelect } = useSelectProperty();
    const { setPendant } = usePendant(block);

    useEffect(() => {
        selectedOption &&
            setFieldName(upperFirst(`${selectedOption.type}#${nanoid(4)}`));
    }, [selectedOption]);

    return (
        <StyledPopoverWrapper>
            <StyledOperationTitle>Add Field</StyledOperationTitle>
            <StyledOperationLabel>Field Type</StyledOperationLabel>
            <Select
                width={284}
                placeholder="Search for a field type"
                value={selectedOption}
                onChange={(selectedValue: PendantOptions) => {
                    setSelectedOption(selectedValue);
                }}
                style={{ marginBottom: 12 }}
            >
                {pendantOptions.map(item => {
                    const Icon = IconMap[item.iconName];
                    return (
                        <Option key={item.name} value={item}>
                            <Icon
                                style={{
                                    fontSize: 20,
                                    marginRight: 12,
                                    color: '#98ACBD',
                                }}
                            />
                            {item.name}
                        </Option>
                    );
                })}
            </Select>
            <StyledOperationLabel>Field Title</StyledOperationLabel>
            <Input
                value={fieldName}
                placeholder="Input your field name here"
                onChange={e => {
                    setFieldName(e.target.value);
                }}
                endAdornment={
                    <Tooltip content="Help info here">
                        <StyledInputEndAdornment>
                            <HelpCenterIcon />
                        </StyledInputEndAdornment>
                    </Tooltip>
                }
            />
            {selectedOption ? (
                <>
                    <StyledDivider />
                    {selectedOption.subTitle && (
                        <StyledPopoverSubTitle>
                            {selectedOption.subTitle}
                        </StyledPopoverSubTitle>
                    )}
                    <PendantModifyPanel
                        type={selectedOption.type}
                        // Select, MultiSelect, Status use this props as initial property
                        initialOptions={genInitialOptions(
                            selectedOption.type,
                            getPendantConfigByType(selectedOption.type)
                        )}
                        iconConfig={getPendantConfigByType(selectedOption.type)}
                        // isStatusSelect={selectedOption.name === 'Status'}
                        onSure={async (type, newPropertyItem, newValue) => {
                            if (!fieldName) {
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
                                const emailOptions = genOptionWithId(
                                    newPropertyItem.emailOptions
                                );

                                const phoneOptions = genOptionWithId(
                                    newPropertyItem.phoneOptions
                                );

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
                                        tempOptions:
                                            newPropertyItem.emailOptions,
                                        tempSelectedId: newValue.email,
                                    }),
                                    phone: getOfficialSelected({
                                        isMulti: true,
                                        options: phoneOptions,
                                        tempOptions:
                                            newPropertyItem.phoneOptions,
                                        tempSelectedId: newValue.phone,
                                    }),
                                    location: getOfficialSelected({
                                        isMulti: true,
                                        options: locationOptions,
                                        tempOptions:
                                            newPropertyItem.locationOptions,
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

                            onSure?.();
                        }}
                    />
                </>
            ) : null}
        </StyledPopoverWrapper>
    );
};

const genOptionWithId = (options: OptionType[] = []) => {
    return options.map((option: OptionType) => ({
        ...option,
        id: genSelectOptionId(),
    }));
};
