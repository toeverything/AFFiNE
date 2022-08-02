import React, { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { Input, Option, Select, Tooltip } from '@toeverything/components/ui';
import { HelpCenterIcon } from '@toeverything/components/icons';
import { AsyncBlock } from '../../editor';

import { IconMap, pendantOptions } from '../config';
import { PendantOptions } from '../types';
import { PendantModifyPanel } from '../pendant-modify-panel';
import {
    StyledDivider,
    StyledInputEndAdornment,
    StyledOperationLabel,
    StyledOperationTitle,
    StyledPopoverSubTitle,
    StyledPopoverWrapper,
} from '../StyledComponent';
import { genInitialOptions, getPendantConfigByType } from '../utils';
import { useOnCreateSure } from './hooks';

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
    const onCreateSure = useOnCreateSure({ block });

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
                        onSure={async (type, newPropertyItem, newValue) => {
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
