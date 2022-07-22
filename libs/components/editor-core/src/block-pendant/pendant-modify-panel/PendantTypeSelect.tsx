import { PendantTypes } from '../types';
import { MuiRadio as Radio, styled } from '@toeverything/components/ui';
import React from 'react';

export const PendantSelect = ({
    currentType,
    types,
    onChange,
}: {
    currentType: PendantTypes;
    types: PendantTypes[];
    onChange: (type: PendantTypes) => void;
}) => {
    return (
        <StyledContainer>
            {types.map(type => {
                return (
                    <div key={type}>
                        <Radio
                            checked={type === currentType}
                            onChange={e => {
                                onChange(type);
                            }}
                            size="small"
                        />
                        {type}
                    </div>
                );
            })}
        </StyledContainer>
    );
};

const StyledContainer = styled('div')`
    display: flex;
    font-size: 12px;
    margin-bottom: 10px;
    margin-top: -10px;
`;
