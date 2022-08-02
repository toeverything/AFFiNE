import React, { useRef, useState } from 'react';

import { ModifyPanelContentProps } from './types';
import { StyledDivider, StyledPopoverSubTitle } from '../StyledComponent';
import { BasicSelect } from './Select';
import { InformationProperty, InformationValue } from '../../recast-block';
import { generateInitialOptions, getPendantIconsConfigByName } from '../utils';

export default (props: ModifyPanelContentProps) => {
    const { onPropertyChange, onValueChange, initialValue, property } = props;
    const propProperty = property as InformationProperty;
    const propValue = initialValue as InformationValue;

    const optionsRef = useRef(propProperty);
    const valueRef = useRef(propValue?.value);

    return (
        <>
            <StyledPopoverSubTitle>Email</StyledPopoverSubTitle>
            <BasicSelect
                isMulti={true}
                iconConfig={getPendantIconsConfigByName('Email')}
                initialValue={propValue?.value?.email || []}
                onValueChange={selectedId => {
                    valueRef.current = {
                        ...valueRef.current,
                        email: selectedId,
                    };
                    onValueChange(valueRef.current);
                }}
                onPropertyChange={options => {
                    // setEmailOptions(options);
                    optionsRef.current = {
                        ...optionsRef.current,
                        emailOptions: options,
                    };
                    onPropertyChange(optionsRef.current);
                }}
                initialOptions={
                    propProperty?.emailOptions ||
                    generateInitialOptions(
                        property?.type,
                        getPendantIconsConfigByName('Email')
                    )
                }
            />
            <StyledDivider />
            <StyledPopoverSubTitle>Phone</StyledPopoverSubTitle>
            <BasicSelect
                isMulti={true}
                iconConfig={getPendantIconsConfigByName('Phone')}
                initialValue={propValue?.value?.phone || []}
                onValueChange={selectedId => {
                    valueRef.current = {
                        ...valueRef.current,
                        phone: selectedId,
                    };
                    onValueChange(valueRef.current);
                }}
                onPropertyChange={options => {
                    optionsRef.current = {
                        ...optionsRef.current,
                        phoneOptions: options,
                    };
                    onPropertyChange(optionsRef.current);
                }}
                initialOptions={
                    propProperty?.phoneOptions ||
                    generateInitialOptions(
                        property?.type,
                        getPendantIconsConfigByName('Phone')
                    )
                }
            />
            <StyledDivider />
            <StyledPopoverSubTitle>Location</StyledPopoverSubTitle>
            <BasicSelect
                isMulti={true}
                iconConfig={getPendantIconsConfigByName('Location')}
                initialValue={propValue?.value?.location || []}
                onValueChange={selectedId => {
                    valueRef.current = {
                        ...valueRef.current,
                        location: selectedId,
                    };
                    onValueChange(valueRef.current);
                }}
                onPropertyChange={options => {
                    optionsRef.current = {
                        ...optionsRef.current,
                        locationOptions: options,
                    };
                    onPropertyChange(optionsRef.current);
                }}
                initialOptions={
                    propProperty?.locationOptions ||
                    generateInitialOptions(
                        property?.type,
                        getPendantIconsConfigByName('Location')
                    )
                }
            />
        </>
    );
};
