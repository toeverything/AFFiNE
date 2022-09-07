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
import { HoverMenu } from './HoverMenu';

import { options } from '../i18n';

export const AFFiNEHeader = () => {
    const matches = useMediaQuery('(max-width: 1024px)');
    const navigate = useNavigate();
    const { i18n } = useTranslation();

    const changeLanguage = (event: any) => {
        i18n.changeLanguage(event);
    };
    const matchesIPAD = useMediaQuery('(max-width: 768px)');
    return (
        <Container container spacing={2}>
            <Grid xs={6} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button
                    size="lg"
                    variant="plain"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        ':hover': { backgroundColor: 'unset' },
                        fontSize: '24px',
                    }}
                    onClick={() => navigate('/')}
                >
                    AFFiNE
                </Button>
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
                    About us
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
                    Blog
                </Button>
                <HoverMenu
                    title="Docs"
                    options={[
                        {
                            title: 'Contribution Guide',
                            value: 'https://docs.affine.pro/',
                        },
                        {
                            title: 'AFFiNE Ambassador',
                            value: 'https://docs.affine.pro/affine-ambassadors/',
                        },
                    ]}
                    onSelect={href => {
                        window.open(href);
                    }}
                />
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
                    Try it online
                </Button>
                <HoverMenu
                    title="Contact us"
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
                    defaultValue="en"
                    sx={{ display: matchesIPAD ? 'none' : 'intial' }}
                    onChange={changeLanguage}
                    size="md"
                    variant="plain"
                >
                    {options.map(option => (
                        <Option key={option.value} value={option.value}>
                            {option.text}
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
    backgroundColor: '#fff',
    zIndex: 1500,
    maxWidth: '1440px',
    margin: 'auto',
    marginTop: '0 !important',
});
