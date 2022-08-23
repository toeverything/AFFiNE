import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Box, Button, Grid, Typography } from '@mui/joy';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
// eslint-disable-next-line no-restricted-imports
import { useMediaQuery } from '@mui/material';

import 'github-markdown-css';
import AboutText from './about.mdx';
import { AFFiNEFooter, AFFiNEImage } from './Common';
import { options } from './i18n';
import KeepUpdate from './keeupdate.png';

export const AboutUs = () => {
    const matches = useMediaQuery('(max-width: 1024px)');
    const navigate = useNavigate();
    const { i18n } = useTranslation();

    const changeLanguage = (event: any) => {
        i18n.changeLanguage(event);
    };
    return (
        <>
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
                        onClick={() => navigate('/')}
                        sx={{
                            padding: matches ? '0' : '0 0.5em',
                            ':hover': { backgroundColor: 'unset' },
                            fontSize: '24px',
                            '@media (max-width: 1024px)': {
                                fontSize: '16px',
                            },
                        }}
                    >
                        AFFiNE
                    </Button>
                </Grid>
                <Grid xs={6} sx={{ display: 'flex', justifyContent: 'right' }}>
                    <Button
                        onClick={() => {
                            window.open('https://blog.affine.pro');
                        }}
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
                    <Select defaultValue="en" onChange={changeLanguage}>
                        {options.map(option => (
                            <Option key={option.value} value={option.value}>
                                {option.text}
                            </Option>
                        ))}
                    </Select>
                </Grid>
            </Grid>
            <Grid xs={12} sx={{ display: 'flex', marginTop: '4vh!important' }}>
                <Box
                    sx={{
                        display: 'inline-flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        margin: 'auto',
                        fontWeight: 'bold',
                        textAlign: 'center',
                    }}
                >
                    <Typography
                        fontSize="64px"
                        fontWeight={900}
                        sx={{
                            marginRight: '0.25em',
                            '@media (max-width: 1024px)': {
                                fontSize: '32px',
                                marginRight: 0,
                            },
                        }}
                    >
                        To Shape, not to adapt.
                    </Typography>
                </Box>
            </Grid>
            <Grid xs={12} sx={{ display: 'flex' }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        margin: 'auto',
                        textAlign: 'center',
                    }}
                >
                    <Typography
                        level="h3"
                        fontSize="24px"
                        fontWeight={'400'}
                        sx={{
                            color: '#888',
                            '@media (max-width: 1024px)': {
                                fontSize: '16px',
                                marginRight: 0,
                            },
                        }}
                    >
                        Deliver Building Blocks for Future SaaS Applications.
                    </Typography>
                </Box>
            </Grid>
            <Grid xs={12} sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box
                    component="article"
                    className="markdown-body"
                    sx={{
                        minWidth: '200px',
                        maxWidth: '720px',
                    }}
                >
                    <AboutText />
                </Box>
            </Grid>
            <Grid xs={12} sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box
                    component="article"
                    className="markdown-body"
                    sx={{
                        minWidth: '200px',
                        maxWidth: '720px',
                    }}
                >
                    <AFFiNEImage
                        src={KeepUpdate}
                        alt="AFFiNE keep update"
                        sx={{ cursor: 'pointer' }}
                        onClick={() =>
                            window.open(
                                'https://github.com/toeverything/AFFiNE'
                            )
                        }
                    />
                </Box>
            </Grid>
            <AFFiNEFooter keepupdate={false} />
        </>
    );
};
