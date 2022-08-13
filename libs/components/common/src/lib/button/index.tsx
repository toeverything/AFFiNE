import React from 'react';
import { styled } from '@toeverything/components/ui';

export type ButtonProps = {
    icon?: React.ReactNode;
    className?: string;
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLElement>;
    style?: React.CSSProperties;
};

const StyledButton = styled('button')({
    border: 'none',
    outline: 'none',
    // backgroundColor: 'white',
    cursor: 'pointer',
    '&:hover': {
        backgroundColor: '#edeef0',
    },
});

export default function Button(props: ButtonProps) {
    const { className, style, children } = props;
    const handleClick = (
        e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement, MouseEvent>
    ) => {
        const { onClick } = props;
        (
            onClick as React.MouseEventHandler<
                HTMLButtonElement | HTMLAnchorElement
            >
        )?.(e);
    };
    return (
        <StyledButton className={className} style={style} onClick={handleClick}>
            {children}
        </StyledButton>
    );
}
