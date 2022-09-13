import { styled } from '@toeverything/components/ui';
import { useTranslation } from '@toeverything/datasource/i18n';

export const LayoutSettings = () => {
    const { t } = useTranslation();
    return (
        <StyledText>
            <p>{t('ComingSoon')}</p>
        </StyledText>
    );
};

const StyledText = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        justifyContent: 'center',
        color: theme.affine.palette.menu,
        marginTop: theme.affine.spacing.lgSpacing,
    };
});
