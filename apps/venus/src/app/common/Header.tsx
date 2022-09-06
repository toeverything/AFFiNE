/* eslint-disable @typescript-eslint/naming-convention */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button, Grid } from '@mui/joy';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
// eslint-disable-next-line no-restricted-imports
import { useMediaQuery } from '@mui/material';

import { options } from '../i18n';
import { GitHub } from '../Icons';

export const AFFiNEHeader = () => {
    const matches = useMediaQuery('(max-width: 1024px)');
    const navigate = useNavigate();
    const { i18n } = useTranslation();

    const changeLanguage = (event: any) => {
        i18n.changeLanguage(event);
    };
    const matchesIPAD = useMediaQuery('(max-width: 768px)');
    return (
        <Grid
            container
            spacing={2}
            sx={{
                maxWidth: '1280px',
                margin: 'auto',
            }}
        >
            <Grid xs={6}>
                <Button
                    size="lg"
                    variant="plain"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        ':hover': { backgroundColor: 'unset' },
                        fontSize: '24px',
                        '@media (max-width: 1024px)': {
                            fontSize: '16px',
                        },
                    }}
                    onClick={() => navigate('/')}
                >
                    AFFiNE
                </Button>
            </Grid>
            <Grid xs={6} sx={{ display: 'flex', justifyContent: 'right' }}>
                <GitHub flat />
                <Button
                    onClick={() => window.open('https://blog.affine.pro')}
                    variant="plain"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        ':hover': { backgroundColor: 'unset' },
                        fontSize: '24px',
                        '@media (max-width: 1024px)': {
                            fontSize: '16px',
                        },
                    }}
                    size="lg"
                >
                    Blog
                </Button>
                <Button
                    onClick={() => navigate('/aboutus')}
                    variant="plain"
                    sx={{
                        padding: matches ? '0' : '0 0.5em',
                        ':hover': { backgroundColor: 'unset' },
                        fontSize: '24px',
                        '@media (max-width: 1024px)': {
                            fontSize: '16px',
                        },
                    }}
                    size="lg"
                >
                    About Us
                </Button>
                <Select
                    defaultValue="en"
                    sx={{ display: matchesIPAD ? 'none' : 'intial' }}
                    onChange={changeLanguage}
                >
                    {options.map(option => (
                        <Option key={option.value} value={option.value}>
                            {option.text}
                        </Option>
                    ))}
                </Select>
            </Grid>
        </Grid>
    );
};
