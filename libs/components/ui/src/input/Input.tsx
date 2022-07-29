import React, {
    forwardRef,
    type ForwardedRef,
    type InputHTMLAttributes,
    type CSSProperties,
} from 'react';
import { styled } from '../styled';

export type InputProps = {
    startAdornment?: React.ReactNode;
    endAdornment?: React.ReactNode;
    style?: CSSProperties;
    noBorder?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef(
    (props: InputProps, ref: ForwardedRef<HTMLInputElement>) => {
        // const { getRootProps, getInputProps } = useInput(props);
        const {
            style,
            startAdornment = null,
            endAdornment = null,
            onClick,
            noBorder = false,
            ...inputProps
        } = props;

        return (
            <StyledInputRoot
                noBorder={noBorder}
                style={style}
                onClick={onClick}
            >
                {startAdornment}
                <StyledInputElement ref={ref} {...inputProps} />
                {endAdornment}
            </StyledInputRoot>
        );
    }
);

const StyledInputRoot = styled('div')<{ noBorder: boolean }>(
    ({ noBorder, theme }) => ({
        height: '32px',
        display: 'flex',
        border: noBorder
            ? 'none'
            : `1px solid ${theme.affine.palette.borderColor}`,
        borderRadius: '10px',
        color: `${theme.affine.palette.secondaryText}`,
        padding: '0 12px',
        fontSize: '14px',
        lineHeight: '1.5',
        transition: 'border .1s',
        '&:focus-within': {
            borderColor: `${theme.affine.palette.primary}`,
        },
    })
);

const StyledInputElement = styled('input')(({ theme }) => ({
    fontSize: '14px',
    lineHeight: '1.5',
    color: `${theme.affine.palette.secondaryText}`,
    flexGrow: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    '&::placeholder': {
        color: `${theme.affine.palette.borderColor}`,
    },
}));
