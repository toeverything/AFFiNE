import React, { forwardRef, type CSSProperties, useState } from 'react';
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

export const IconInput = forwardRef<HTMLInputElement, IconInputProps>(
    ({ iconName, iconStyle, color, background, ...inputProps }, ref) => {
        return (
            <>
                <PendantIcon
                    iconName={iconName}
                    iconStyle={iconStyle}
                    color={color}
                    background={background}
                />
                <Input
                    ref={ref}
                    style={{
                        flexGrow: '1',
                    }}
                    noBorder
                    {...inputProps}
                />
            </>
        );
    }
);

type HighLightIconInputProps = {
    startElement?: React.ReactNode;
    endElement?: React.ReactNode;
    tabIndex?: number;
} & IconInputProps;

export const HighLightIconInput = forwardRef<
    HTMLInputElement,
    HighLightIconInputProps
>((props, ref) => {
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
                ref={ref}
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
});

const StyledIconWrapper = styled('div')`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 12px;
    width: 20px;
    height: 20px;
    border-radius: 3px;
`;
