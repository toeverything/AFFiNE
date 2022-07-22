import React, { type CSSProperties, useState } from 'react';
import { Input, styled, InputProps } from '@toeverything/components/ui';
import { StyledHighLightWrapper } from '../StyledComponent';
import { IconNames } from '../types';
import { IconMap } from '../config';

type IconInputProps = PendantIconProps & InputProps;

type PendantIconProps = {
    iconName?: IconNames;
    background?: CSSProperties['background'];
    color?: CSSProperties['color'];
    iconStyle?: CSSProperties;
};

export const PendantIcon = ({
    iconName,
    iconStyle,
    color,
    background,
}: PendantIconProps) => {
    const Icon = IconMap[iconName];
    return (
        Icon && (
            <StyledIconWrapper style={{ ...iconStyle, color, background }}>
                <Icon style={{ fontSize: 16, color }} />
            </StyledIconWrapper>
        )
    );
};

export const IconInput = ({
    iconName,
    iconStyle,
    color,
    background,
    ...inputProps
}: IconInputProps) => {
    return (
        <>
            <PendantIcon
                iconName={iconName}
                iconStyle={iconStyle}
                color={color}
                background={background}
            />
            <Input
                style={{
                    flexGrow: '1',
                    border: 'none',
                }}
                {...inputProps}
            />
        </>
    );
};

type HighLightIconInputProps = {
    startElement?: React.ReactNode;
    endElement?: React.ReactNode;
} & IconInputProps;

export const HighLightIconInput = (props: HighLightIconInputProps) => {
    const {
        onFocus,
        onBlur,
        startElement = null,
        endElement = null,
        ...otherProps
    } = props;
    const [focus, setFocus] = useState(false);

    return (
        <StyledHighLightWrapper isFocus={focus}>
            {startElement}
            <IconInput
                onFocus={e => {
                    setFocus(true);
                    onFocus?.(e);
                }}
                onBlur={e => {
                    setFocus(false);
                    onBlur?.(e);
                }}
                {...otherProps}
            />
            {endElement}
        </StyledHighLightWrapper>
    );
};

const StyledIconWrapper = styled('div')`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 12px;
    width: 20px;
    height: 20px;
    border-radius: 3px;
`;
