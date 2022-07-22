import { styled } from '../styled';
import type { ThemeOptions } from '../theme/theme';

type TypographyType = keyof ThemeOptions['typography'];

interface TypographyProps {
    /**
     * Binding with typography in theme.
     * Default: sm
     */
    type?: TypographyType;
}

export const Typography = styled('span')<TypographyProps>(({ theme, type }) => {
    const config = theme.affine.typography[type] || theme.affine.typography.sm;
    return config;
});
