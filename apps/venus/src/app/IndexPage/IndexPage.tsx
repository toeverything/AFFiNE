/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/naming-convention */
import { useTranslation } from 'react-i18next';

import { Box, Button, Grid, Typography } from '@mui/joy';
import { LogoIcon } from '@toeverything/components/icons';
// eslint-disable-next-line no-restricted-imports
import { useMediaQuery } from '@mui/material';

import { AFFiNEFooter, AFFiNEHeader, AFFiNEImage } from '../common';
import { GitHub } from '../Icons';
import { AlternativesProduct } from './Alternatives';
import CollaborationImage from './collaboration.png';
import { FunctionTabs } from './FunctionTabs';
import PageImage from './page.png';

const AFFiNEOnline = (props: { center?: boolean; flat?: boolean }) => {
    const matches = useMediaQuery('(max-width: 1024px)');
    const { t } = useTranslation();
    return (
        <Button
            onClick={() => {
                window.open('https://livedemo.affine.pro/');
            }}
            {...(props.flat ? { variant: 'plain' } : {})}
            {...{
                sx: {
                    margin: 'auto 1em',
                    fontSize: '24px',
                    '@media (max-width: 1024px)': {
                        fontSize: '16px',
                    },
                    ...(props.flat
                        ? {
                              padding: matches ? '0' : '0 0.5em',
                              ':hover': { backgroundColor: 'unset' },
                          }
                        : {}),
                    ...(props.center
                        ? {
                              padding: '0.5em 1em',
                              fontSize: '2em',
                              backgroundColor: '#000',
                              ':hover': {
                                  backgroundColor: '#0c60d9',
                                  boxShadow: '2px 2px 20px #08f4',
                              },
                          }
                        : {}),
                },
            }}
            startIcon={<LogoIcon />}
            size="lg"
        >
            {t('Try it Online')}
        </Button>
    );
};

export function IndexPage() {
    const matches = useMediaQuery('(max-width: 1024px)');
    const { t } = useTranslation();

    return (
        <>
            <AFFiNEHeader />
            <Grid xs={12} sx={{ display: 'flex', marginTop: '20vh!important' }}>
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
                        fontSize="96px"
                        fontWeight={900}
                        sx={{
                            marginRight: '0.25em',
                            '@media (max-width: 1024px)': {
                                fontSize: '32px',
                                marginRight: 0,
                            },
                        }}
                    >
                        {t('Open Source')},
                    </Typography>
                    <Typography
                        fontSize="96px"
                        fontWeight={900}
                        sx={{
                            '@media (max-width: 1024px)': {
                                fontSize: '32px',
                            },
                        }}
                    >
                        {t('Privacy First')}
                    </Typography>
                </Box>
            </Grid>
            <Grid
                xs={12}
                sx={{
                    display: 'flex',
                    flexFlow: 'wrap',
                    overflow: 'auto',
                }}
            >
                <Box
                    sx={{
                        display: 'inline-flex',
                        flexFlow: 'wrap',
                        margin: 'auto',
                        fontWeight: 'bold',
                        textAlign: 'center',
                    }}
                >
                    <AlternativesProduct />
                    <Typography
                        fontSize="96px"
                        fontWeight={900}
                        sx={{
                            color: '#06449d',
                            margin: 'auto',
                            '@media (max-width: 1024px)': {
                                fontSize: '32px',
                            },
                        }}
                    >
                        {t('Alternative')}
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
                        fontWeight={'400'}
                        sx={{ color: '#888' }}
                    >
                        {t('description1.part1')}
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
                        marginTop: '1.5em',
                        marginBottom: '12vh!important',
                        rawGap: '1em',
                    }}
                >
                    <GitHub center />
                    <AFFiNEOnline center />
                </Box>
            </Grid>
            <Grid
                xs={12}
                sx={{ display: 'flex', maxWidth: '1200px', margin: 'auto' }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        margin: 'auto',
                        transition: 'all .5s',
                        transform: 'scale(0.98)',
                        boxShadow: '2px 2px 40px #0002',
                        ':hover': {
                            transform: 'scale(1)',
                            boxShadow: '2px 2px 40px #0004',
                        },
                    }}
                >
                    <AFFiNEImage src={PageImage} alt="AFFiNE main ui" />
                </Box>
            </Grid>
            <Grid xs={12} sx={{ display: 'flex' }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        margin: 'auto',
                        marginTop: '12em',
                    }}
                >
                    <Typography
                        level={matches ? 'h2' : 'h1'}
                        fontWeight={'bold'}
                    >
                        {t('description1.part2')}
                    </Typography>
                </Box>
            </Grid>
            <Grid xs={12} sx={{ display: 'flex' }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        flexWrap: 'wrap',
                        margin: 'auto',
                        justifyContent: 'center',
                        textAlign: 'center',
                        marginBottom: '12em',
                    }}
                >
                    <Typography fontSize="1.2em">
                        {t('description1.part3')}
                    </Typography>
                    <Typography fontSize="1.2em">
                        {t('description1.part4')}
                    </Typography>
                </Box>
            </Grid>
            <FunctionTabs />
            <Grid
                xs={12}
                sx={{
                    display: 'flex',
                    marginTop: '12em !important',
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        flexWrap: 'wrap',
                        margin: 'auto',
                        textAlign: 'center',
                        marginBottom: '4em',
                    }}
                >
                    <Typography
                        level="h2"
                        fontWeight={'bold'}
                        style={{ marginBottom: '0.5em' }}
                    >
                        {t('description4.part1')}
                    </Typography>
                    <Typography
                        fontSize="1.2em"
                        style={{ marginBottom: '0.25em' }}
                    >
                        {t('description4.part2')}
                    </Typography>
                    <Typography
                        fontSize="1.2em"
                        style={{ marginBottom: '0.25em' }}
                    >
                        {t('description4.part3')}
                    </Typography>
                </Box>
            </Grid>
            <Grid xs={12} sx={{ display: 'flex', marginBottom: '12em' }}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        margin: 'auto',
                        transition: 'all .5s',
                        transform: 'scale(0.98)',
                        ':hover': {
                            transform: 'scale(1)',
                        },
                    }}
                >
                    <AFFiNEImage
                        src={CollaborationImage}
                        alt="AFFiNE Privacy-first, and collaborative"
                    />
                </Box>
            </Grid>
            <AFFiNEFooter />
        </>
    );
}
