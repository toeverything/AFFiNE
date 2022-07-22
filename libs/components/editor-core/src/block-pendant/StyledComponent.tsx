import React from 'react';
import { styled } from '@toeverything/components/ui';

export const IconButton = styled('button')`
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: #f5f7f8;
    color: #98acbd;
    display: inline-flex;
    align-items: center;
    justify-content: center;
`;

const commonStyle = {
    height: '24px',
    padding: '0 8px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '12px',
    borderRadius: '5px',
};

export const StyledSureButton = styled('button')(({ theme }) => ({
    ...commonStyle,
    background: theme.affine.palette.primary,
    color: '#fff',
}));

export const StyledCancelButton = styled('button')(({ theme }) => ({
    ...commonStyle,
    background: '#fff',
    color: theme.affine.palette.primaryText,
    border: `1px solid ${theme.affine.palette.borderColor}`,
}));

export const StyledPopoverWrapper = styled('div')`
    padding: 24px;
    width: 332px;
    color: #4c6275;
    line-height: 1.5;
`;

export const StyledOperationWrapper = styled('div')<{ isFocus: boolean }>(
    ({ isFocus, theme }) => {
        return {
            display: 'flex',
            alignItems: 'center',
            borderTop: `1px solid`,
            borderBottom: `1px solid`,
            borderColor: isFocus
                ? `${theme.affine.palette.primary}`
                : 'transparent',
            transition: 'border .1s',
        };
    }
);

export const StyledOperationTitle = styled('div')(({ theme }) => {
    return {
        color: theme.affine.palette.secondaryText,
        fontSize: 20,
        marginBottom: 12,
        fontWeight: 'bold',
    };
});

export const StyledOperationLabel = styled('div')(({ theme }) => {
    return {
        color: theme.affine.palette.secondaryText,
        fontSize: 12,
        marginBottom: 12,
        fontWeight: 'bold',
    };
});

export const StyledInputEndAdornment = styled('div')`
    width: 32px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
`;

export const StyledDivider = styled('div')`
    height: 1px;
    padding: 12px 0;
    margin: 12px 0;
    position: relative;
    &::after {
        content: '';
        width: 100%;
        height: 1px;
        background: #e0e6eb;
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        margin: auto;
    }
`;

export const StyledPopoverContent = styled('div')(({ theme }) => {
    return {
        color: theme.affine.palette.secondaryText,
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        marginBottom: '12px',
    };
});
export const StyledPopoverSubTitle = styled('div')(({ theme }) => {
    return {
        color: theme.affine.palette.secondaryText,
        fontSize: '16px',
        marginBottom: '12px',
        fontWeight: 'bold',
        padding: '0 12px',
    };
});

export const StyledHighLightWrapper = styled('div')<{
    isFocus: boolean;
}>(({ isFocus, theme }) => {
    return {
        display: 'flex',
        alignItems: 'center',
        borderTop: `1px solid`,
        borderBottom: `1px solid`,
        borderColor: isFocus ? theme.affine.palette.primary : 'transparent',
        transition: 'border .1s',
    };
});
