import { forwardRef, type ForwardedRef } from 'react';
/* eslint-disable no-restricted-imports */
import InputUnstyled, {
    inputUnstyledClasses,
    type InputUnstyledProps,
} from '@mui/base/InputUnstyled';
import { styled } from '../styled';

/**
 *  Input is extend by mui InputUnstyled
 *
 * InputUnstyled Demos:
 *
 * - [Input](https://mui.com/base/react-input/)
 *
 * InputUnstyled API:
 *
 * - [InputUnstyled API](https://mui.com/base/api/input-unstyled/)
 *
 * **/
export type InputProps = InputUnstyledProps;

export const Input = forwardRef(function CustomInput(
    props: InputUnstyledProps,
    ref: ForwardedRef<HTMLDivElement>
) {
    const { components, ...other } = props;
    return (
        <InputUnstyled
            components={{
                Root: StyledInputRoot,
                Input: StyledInputElement,
                ...components,
            }}
            {...other}
            ref={ref}
        />
    );
});

const StyledInputRoot = styled('div')(({ theme }) => ({
    height: '32px',
    display: 'flex',
    border: `1px solid ${theme.affine.palette.borderColor}`,
    borderRadius: '10px',
    color: `${theme.affine.palette.secondaryText}`,
    padding: '0 12px',
    fontSize: '14px',
    lineHeight: '1.5',
    transition: 'border .1s',
    [`&.${inputUnstyledClasses.focused}`]: {
        borderColor: `${theme.affine.palette.primary}`,
    },
}));

const StyledInputElement = styled('input')(({ theme }) => ({
    fontSize: '14px',
    lineHeight: '1.5',
    color: `${theme.affine.palette.secondaryText}`,
    flexGrow: 1,
    '&::placeholder': {
        color: `${theme.affine.palette.borderColor}`,
    },
}));
