import React, { useEffect, useRef, useState } from 'react';
import { PendantTypes } from '../types';
import { ModifyPanelContentProps, ModifyPanelProps } from './types';
import { MuiButton as Button, styled } from '@toeverything/components/ui';
import DatePanel from './Date';
import TextPanel from './Text';
import { Select } from './Select';
import Mention from './Mention';
import Information from './Information';

import { PendantSelect } from './PendantTypeSelect';
import { StyledCancelButton, StyledSureButton } from '../StyledComponent';

const View = (props: ModifyPanelContentProps) => {
    const { type } = props;
    switch (type) {
        case PendantTypes.Date:
            return <DatePanel {...props} />;
        case PendantTypes.Text:
            return <TextPanel {...props} />;
        case PendantTypes.Status:
            return <Select {...props} isMulti={false} />;
        case PendantTypes.Select:
            return <Select {...props} isMulti={false} />;
        case PendantTypes.MultiSelect:
            return <Select {...props} isMulti={true} />;
        case PendantTypes.Mention:
            return <Mention {...props} />;
        case PendantTypes.Information:
            return <Information {...props} />;
        default:
            return <div className="">{type}</div>;
    }
};

export const PendantModifyPanel = ({
    type: propsType,
    onSure,
    onDelete,
    initialValue,
    property,
    onCancel,
    initialOptions,
    iconConfig,
    isStatusSelect,
}: ModifyPanelProps) => {
    const currentValue = useRef(initialValue?.value);
    // propertyValueMemo is used to memoize the property,
    // the property is not complete defined yet and it maybe not here
    // so use any type defined
    const propertyValueMemo = useRef<any>();
    useEffect(() => {
        currentValue.current = initialValue?.value;
    }, [propsType]);

    const [type, setType] = useState<PendantTypes>();

    useEffect(() => {
        setType(Array.isArray(propsType) ? propsType[0] : propsType);
    }, [propsType]);

    return (
        <>
            {Array.isArray(propsType) && (
                <PendantSelect
                    currentType={type}
                    types={propsType}
                    onChange={selectType => setType(selectType)}
                />
            )}

            <View
                type={type}
                initialValue={initialValue}
                onValueChange={newValue => {
                    currentValue.current = newValue;
                }}
                onPropertyChange={newPropertyValue => {
                    propertyValueMemo.current = newPropertyValue;
                }}
                property={property}
                initialOptions={initialOptions}
                iconConfig={iconConfig}
                isStatusSelect={isStatusSelect}
            />
            <ModifyPanelBottom>
                {onDelete && (
                    <StyledCancelButton
                        style={{ marginRight: 10 }}
                        onClick={async () => {
                            onDelete?.(
                                type,
                                currentValue.current,
                                propertyValueMemo.current
                            );
                        }}
                    >
                        Delete
                    </StyledCancelButton>
                )}

                {onCancel && (
                    <StyledCancelButton
                        style={{ marginRight: 10 }}
                        onClick={async () => {
                            onCancel?.();
                        }}
                    >
                        Cancel
                    </StyledCancelButton>
                )}
                <StyledSureButton
                    onClick={async () => {
                        onSure(
                            type,
                            propertyValueMemo.current,
                            currentValue.current
                        );
                    }}
                >
                    Apply
                </StyledSureButton>
            </ModifyPanelBottom>
        </>
    );
};

const ModifyPanelBottom = styled('div')({
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '12px',
});
