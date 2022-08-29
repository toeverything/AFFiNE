/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/naming-convention */
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Box, Button, Grid, Typography } from '@mui/joy';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import { styled } from '@mui/joy/styles';
import { LogoIcon } from '@toeverything/components/icons';
// eslint-disable-next-line no-restricted-imports
import { useMediaQuery } from '@mui/material';

import CollaborationImage from './collaboration.png';
import { AFFiNEFooter, AFFiNEImage } from './Common';
import { options } from './i18n';
import { GitHub } from './Icons';
import PageImage from './page.png';
import ShapeImage from './shape.png';
import TaskImage from './task.png';

const Alternatives = styled(Box)<{ width: string }>(({ width }) => ({
    position: 'relative',
    width: '24em',
    height: '128px',
    transform: 'translateY(-8px)',
    overflowY: 'hidden',
    '@media (max-width: 1024px)': {
        width,
        height: '48px',
        transform: 'translateY(0)',
    },
    '& .scroll-element': {
        width: 'inherit',
        height: 'inherit',
        position: 'absolute',
        left: '0%',
        top: '0%',
        lineHeight: '96px',
        '@media (max-width: 1024px)': {
            lineHeight: '32px',
        },
    },
    '& .scroll-element.active': {
        animation: 'primary 500ms linear infinite',
    },
    '.primary.active': {
        animation: 'primary 500ms linear infinite',
    },
    '.secondary.active': {
        animation: 'secondary 500ms linear infinite',
    },
    '@keyframes primary': {
        from: {
            top: '0%',
        },
        to: {
            top: '-100%',
        },
    },
    '@keyframes secondary': {
        from: {
            top: '100%',
        },
        to: {
            top: '0%',
        },
    },
}));

const _alternatives = ['Notion', 'Miro', 'Monday'];
const _alternativesSize = [8, 6, 10];

const Product = () => {
    const [idx, setIdx] = useState(0);
    const [last, current] = useMemo(
        () => [
            _alternatives[idx],
            _alternatives[idx + 1] ? _alternatives[idx + 1] : _alternatives[0],
        ],
        [idx]
    );
    const maxWidth = useMemo(() => _alternativesSize[idx], [idx]);
    const [active, setActive] = useState(false);
    const matches = useMediaQuery('(max-width: 1024px)');

    useEffect(() => {
        const handle = setInterval(() => {
            setActive(true);
            setTimeout(
                () => {
                    setIdx(idx => (_alternatives[idx + 1] ? idx + 1 : 0));
                    setActive(false);
                },
                matches ? 450 : 380
            );
        }, 2000);
        return () => clearInterval(handle);
    }, [matches]);

    return (
        <Alternatives
            width={`${maxWidth}em`}
            sx={{
                margin: 'auto',
                marginRight: '1em',
                transition: 'width .5s',
                '@media (max-width: 1024px)': {
                    width: '8em',
                },
            }}
        >
            <Box
                className={clsx(
                    'scroll-element',
                    'primary',
                    active && 'active'
                )}
            >
                <Typography
                    fontSize="96px"
                    fontWeight={900}
                    sx={{
                        color: '#06449d',
                        textAlign: 'right',
                        overflow: 'hidden',
                        '@media (max-width: 1024px)': {
                            fontSize: '32px',
                        },
                    }}
                >
                    {last}
                </Typography>
            </Box>
            <Box
                className={clsx(
                    'scroll-element',
                    'primary',
                    active && 'active'
                )}
                sx={{
                    marginTop: '96px',
                    textAlign: 'right',
                    overflow: 'hidden',
                    '@media (max-width: 1024px)': {
                        marginTop: '48px',
                    },
                }}
            >
                <Typography
                    fontSize="96px"
                    fontWeight={900}
                    sx={{
                        color: '#06449d',
                        overflow: 'hidden',
                        '@media (max-width: 1024px)': {
                            fontSize: '32px',
                        },
                    }}
                >
                    {current}
                </Typography>
            </Box>
        </Alternatives>
    );
};

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

export function App() {
    const matches = useMediaQuery('(max-width: 1024px)');
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

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
                        {t('Blog')}
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
                        {t('AboutUs')}
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
            <Grid xs={12} sx={{ display: 'flex', marginTop: '12vh!important' }}>
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
                    <Product />
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
            <Grid
                xs={12}
                sx={{
                    display: 'flex',
                    flexDirection: matches ? 'column' : 'row',
                    marginBottom: '12em',
                }}
            >
                <Grid
                    xs={matches ? 12 : 3}
                    sx={{
                        display: 'flex',
                        ...(matches
                            ? {}
                            : { marginLeft: '4em', marginRight: '2em' }),
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            flexWrap: 'wrap',
                            justifyContent: 'left',
                            alignSelf: 'center',
                            textAlign: 'left',
                            width: '100%',
                        }}
                    >
                        <Typography
                            level="h2"
                            fontWeight={'bold'}
                            style={{ marginBottom: '0.5em' }}
                        >
                            {t('description2.part1')}
                        </Typography>
                        <Typography
                            fontSize="1.2em"
                            style={{ marginBottom: '0.25em' }}
                        >
                            {t('description2.part2')}
                        </Typography>
                        <Typography
                            fontSize="1.2em"
                            style={{ marginBottom: '0.25em' }}
                        >
                            {t('description2.part3')}
                        </Typography>
                    </Box>
                </Grid>
                <Grid
                    xs={matches ? 12 : 9}
                    sx={{ display: 'flex', width: '100%' }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            flexWrap: 'wrap',
                            justifyContent: 'left',
                            textAlign: 'left',
                            transition: 'all .5s',
                            transform: 'scale(0.98)',
                            boxShadow: '2px 2px 40px #0002',
                            ':hover': {
                                transform: 'scale(1)',
                                boxShadow: '2px 2px 40px #0004',
                            },
                        }}
                    >
                        <AFFiNEImage
                            src={ShapeImage}
                            alt="AFFiNE Shape Your Page"
                        />
                    </Box>
                </Grid>
            </Grid>
            <Grid
                xs={12}
                sx={{
                    display: 'flex',
                    flexDirection: matches ? 'column' : 'row-reverse',
                    marginBottom: '12em',
                }}
            >
                <Grid
                    xs={matches ? 12 : 6}
                    sx={{
                        display: 'flex',
                        ...(matches ? {} : { marginLeft: '4em' }),
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            flexWrap: 'wrap',
                            justifyContent: 'left',
                            alignSelf: 'center',
                            textAlign: 'left',
                            width: '100%',
                        }}
                    >
                        <Typography
                            level="h2"
                            fontWeight={'bold'}
                            style={{ marginBottom: '0.5em' }}
                        >
                            {t('description3.part1')}
                        </Typography>
                        <Typography
                            fontSize="1.2em"
                            style={{ marginBottom: '0.25em' }}
                        >
                            {t('description3.part2')}
                        </Typography>
                        <Typography
                            fontSize="1.2em"
                            style={{ marginBottom: '0.25em' }}
                        >
                            {t('description3.part3')}
                        </Typography>
                        <Typography
                            fontSize="1.2em"
                            style={{ marginBottom: '0.25em' }}
                        >
                            {t('description3.part4')}
                        </Typography>
                    </Box>
                </Grid>
                <Grid
                    xs={matches ? 12 : 6}
                    sx={{ display: 'flex', width: '100%' }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            flexWrap: 'wrap',
                            justifyContent: 'left',
                            textAlign: 'left',
                            transition: 'all .5s',
                            transform: 'scale(0.98)',
                            boxShadow: '2px 2px 40px #0002',
                            ':hover': {
                                transform: 'scale(1)',
                                boxShadow: '2px 2px 40px #0004',
                            },
                        }}
                    >
                        <AFFiNEImage
                            src={TaskImage}
                            alt="AFFiNE Plan Your Task"
                        />
                    </Box>
                </Grid>
            </Grid>
            <Grid
                xs={12}
                sx={{
                    display: 'flex',
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
