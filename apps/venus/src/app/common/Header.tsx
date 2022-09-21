/* eslint-disable @typescript-eslint/naming-convention */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button, Grid } from '@mui/joy';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
// eslint-disable-next-line no-restricted-imports
import GitHubIcon from '@mui/icons-material/GitHub';
// eslint-disable-next-line no-restricted-imports
import { styled, useMediaQuery } from '@mui/material';
import AFFiNETextLogo from './affine-text-logo.png';
import { HoverMenu } from './HoverMenu';
import { MobileHeader } from './MobileHeader';

import { LOCALES } from '../i18n';

export const AFFiNEHeader = () => {
    const matches = useMediaQuery('(max-width: 1024px)');
    const navigate = useNavigate();
    const { i18n, t } = useTranslation();

    const changeLanguage = (event: any) => {
        i18n.changeLanguage(event);
    };
    const matchesIPAD = useMediaQuery('(max-width: 1080px)');
    if (matchesIPAD) {
        return <MobileHeader />;
    }
    return (
        <Container container spacing={2}>
            <Grid xs={6} sx={{ display: 'flex', alignItems: 'center' }}>
                <StyledImage
                    src={AFFiNETextLogo}
                    alt="affine"
                    onClick={() => navigate('/')}
                />
                <Button
                    onClick={() => navigate('/aboutus')}
                    variant="plain"
                    color="neutral"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        fontSize: '16px',
                    }}
                    size="md"
                >
                    {t('AboutUs')}
                </Button>
                <Button
                    onClick={() => window.open('https://blog.affine.pro')}
                    variant="plain"
                    color="neutral"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        fontSize: '16px',
                    }}
                    size="md"
                >
                    {t('Blog')}
                </Button>
                <Button
                    onClick={() => window.open('https://docs.affine.pro/')}
                    variant="plain"
                    color="neutral"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        fontSize: '16px',
                    }}
                    size="md"
                >
                    {t('Docs')}
                </Button>
                <Button
                    onClick={() => window.open('https://feedback.affine.pro/')}
                    variant="plain"
                    color="neutral"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        fontSize: '16px',
                    }}
                    size="md"
                >
                    {t('Feedback')}
                </Button>
            </Grid>
            <Grid xs={6} sx={{ display: 'flex', justifyContent: 'right' }}>
                <Button
                    variant="plain"
                    color="neutral"
                    onClick={() =>
                        window.open('https://github.com/toeverything/AFFiNE')
                    }
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        fontSize: '16px',
                    }}
                    size="md"
                >
                    <GitHubIcon />
                </Button>
                <Button
                    onClick={() => window.open('https://livedemo.affine.pro/')}
                    variant="plain"
                    color="neutral"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        fontSize: '16px',
                    }}
                    size="md"
                >
                    {t('Try it Online')}
                </Button>
                <HoverMenu
                    title={t('ContactUs')}
                    options={[
                        {
                            title: 'Discord',
                            value: 'https://discord.gg/Arn7TqJBvG',
                        },
                        {
                            title: 'Telegram',
                            value: 'https://t.me/affineworkos',
                        },
                        {
                            title: 'Reddit',
                            value: 'https://www.reddit.com/r/Affine/',
                        },
                        {
                            title: 'Medium',
                            value: 'https://medium.com/@affineworkos',
                        },
                        {
                            title: 'Email',
                            value: 'mailto:contact@toeverything.info',
                        },
                    ]}
                    onSelect={href => {
                        window.open(href);
                    }}
                />
                <Select
                    defaultValue={i18n.resolvedLanguage}
                    sx={{ display: matchesIPAD ? 'none' : 'intial' }}
                    onChange={changeLanguage}
                    size="md"
                    variant="plain"
                >
                    {LOCALES.map(lang => (
                        <Option key={lang.tag} value={lang.tag}>
                            {lang.originalName}
                        </Option>
                    ))}
                </Select>
            </Grid>
        </Container>
    );
};

const Container = styled(Grid)({
    position: 'fixed',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    paddingTop: '1em',
    paddingBottom: '1em',
    backgroundColor: '#fff',
    zIndex: 1500,
    maxWidth: '1440px',
    margin: 'auto',
    marginTop: '0 !important',
});

const StyledImage = styled('img')({
    height: '24px',
    marginRight: '16px',
    cursor: 'pointer',
});
