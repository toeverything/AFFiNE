import React, { useState, useEffect } from 'react';
import { message, Option, Select } from '@toeverything/components/ui';
import { AsyncBlock } from '../../editor';

import { IconMap, pendantOptions } from '../config';
import { PendantOptions } from '../types';
import { PendantModifyPanel } from '../pendant-modify-panel';
import {
    StyledDivider,
    StyledOperationLabel,
    StyledOperationTitle,
    StyledPopoverSubTitle,
    StyledPopoverWrapper,
} from '../StyledComponent';
import {
    generateRandomFieldName,
    generateInitialOptions,
    getPendantConfigByType,
    checkPendantForm,
} from '../utils';
import { FieldTitleInput } from './FieldTitleInput';
import { useOnCreateSure } from './hooks';

export const CreatePendantPanel = ({
    block,
    onSure,
    onTypeChange,
}: {
    block: AsyncBlock;
    onSure?: () => void;
    onTypeChange?: (option: PendantOptions) => void;
}) => {
    const [selectedOption, setSelectedOption] = useState<PendantOptions>();
    const [fieldName, setFieldName] = useState<string>('');
    const onCreateSure = useOnCreateSure({ block });

    useEffect(() => {
        selectedOption &&
            setFieldName(generateRandomFieldName(selectedOption.type));
    }, [selectedOption]);

    useEffect(() => {
        onTypeChange?.(selectedOption);
    }, [selectedOption, onTypeChange]);

    return (
        <StyledPopoverWrapper>
            <StyledOperationTitle>Add Field</StyledOperationTitle>
            <StyledOperationLabel>Field Type</StyledOperationLabel>
            <Select
                width={284}
                placeholder="Search for a field type"
                value={selectedOption ?? null}
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
            <FieldTitleInput
                value={fieldName}
                onChange={e => {
                    setFieldName(e.target.value);
                }}
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
                        initialOptions={generateInitialOptions(
                            selectedOption.type,
                            getPendantConfigByType(selectedOption.type)
                        )}
                        iconConfig={getPendantConfigByType(selectedOption.type)}
                        onSure={async (type, newPropertyItem, newValue) => {
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
                            await onCreateSure({
                                type,
                                newPropertyItem,
                                newValue,
                                fieldName,
                            });
                            onSure?.();
                        }}
                    />
                </>
            ) : null}
        </StyledPopoverWrapper>
    );
};
