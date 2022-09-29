import { LogoIcon as _LogoIcon } from '@toeverything/components/icons';
import { styled } from '@toeverything/components/ui';

export const LogoIcon = styled(_LogoIcon)(({ theme }) => {
    return {
        color: theme.affine.palette.primary,
        cursor: 'pointer',
    };
});
