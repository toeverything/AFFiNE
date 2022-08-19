/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/naming-convention */
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import GitHubIcon from '@mui/icons-material/GitHub';
import RedditIcon from '@mui/icons-material/Reddit';
import TelegramIcon from '@mui/icons-material/Telegram';
import { Box, Button, Container, Grid, SvgIcon, Typography } from '@mui/joy';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import { CssVarsProvider, styled } from '@mui/joy/styles';
import { LogoIcon } from '@toeverything/components/icons';
// eslint-disable-next-line no-restricted-imports
import { useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import CollaborationImage from './collaboration.png';
import { options } from './i18n';
import LogoImage from './logo.png';
import PageImage from './page.png';
import ShapeImage from './shape.png';
import TaskImage from './task.png';

const DiscordIcon = (props: any) => {
    return (
        <SvgIcon
            {...props}
            width="71"
            height="55"
            viewBox="0 0 71 55"
            fill="currentcolor"
        >
            <g clipPath="url(#clip0)">
                <path
                    d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
                    fill="currentcolor"
                />
            </g>
            <defs>
                <clipPath id="clip0">
                    <rect width="71" height="55" fill="white" />
                </clipPath>
            </defs>
        </SvgIcon>
    );
};

const VenusContainer = styled(Container)({
    margin: '1em auto',
});

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

const AffineImage = styled('img')({
    maxWidth: '100%',
    objectFit: 'contain',
});

const GitHub = (props: { center?: boolean; flat?: boolean }) => {
    const matches = useMediaQuery('(max-width: 1024px)');
    const { t } = useTranslation();

    return (
        <Button
            onClick={() => {
                window.open('https://github.com/toeverything/AFFiNE');
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
                              ':hover': {
                                  backgroundColor: '#0c60d9',
                                  boxShadow: '2px 2px 20px #08f4',
                              },
                          }
                        : {}),
                },
            }}
            startIcon={<GitHubIcon />}
            size="lg"
        >
            {props.center ? t('Check GitHub') : t('GitHub')}
        </Button>
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
    const { t, i18n } = useTranslation();

    const changeLanguage = (event: any) => {
        i18n.changeLanguage(event);
    };
    return (
        <CssVarsProvider>
            <VenusContainer
                fixed
                sx={{
                    maxWidth: '1440px !important',
                    '&>div': {
                        marginTop: '1em',
                    },
                }}
            >
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
                    <Grid
                        xs={6}
                        sx={{ display: 'flex', justifyContent: 'right' }}
                    >
                        <GitHub flat />
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
                <Grid
                    xs={12}
                    sx={{ display: 'flex', marginTop: '12vh!important' }}
                >
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
                        <AffineImage src={PageImage} alt="AFFiNE main ui" />
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
                            <AffineImage
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
                            <AffineImage
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
                        <AffineImage
                            src={CollaborationImage}
                            alt="AFFiNE Privacy-first, and collaborative"
                        />
                    </Box>
                </Grid>
                <Grid xs={12} sx={{ display: 'flex' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            margin: 'auto',
                        }}
                    >
                        <AffineImage src={LogoImage} alt="AFFiNE Logo" />
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
                        <Typography fontSize={'1.5em'}>
                            {t('BuildFor')}
                        </Typography>
                    </Box>
                </Grid>
                <Grid xs={12} sx={{ display: 'flex', marginBottom: '8em' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            margin: 'auto',
                            textAlign: 'center',
                        }}
                    >
                        <Typography level="h3" sx={{ display: 'flex' }}>
                            <span style={{ alignSelf: 'center' }}>
                                {t('KeepUpdated')}
                            </span>
                            <GitHub />
                        </Typography>
                    </Box>
                </Grid>
                <Grid xs={12} sx={{ display: 'flex', marginBottom: '2em' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            margin: 'auto',
                            textAlign: 'center',
                        }}
                    >
                        <Typography level="h2" sx={{ display: 'flex' }}>
                            {t('Join')}
                        </Typography>
                    </Box>
                </Grid>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        maxWidth: '400px',
                        margin: 'auto',
                        marginBottom: '2em',
                        '--joy-shadow-sm': 0,
                    }}
                >
                    <Box sx={{ display: 'flex', width: '100%' }}>
                        <Button
                            variant="plain"
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                margin: 'auto',
                                padding: '1em',
                                minWidth: '6em',
                            }}
                            onClick={() =>
                                window.open(
                                    'https://github.com/toeverything/AFFiNE/'
                                )
                            }
                        >
                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <GitHubIcon
                                    sx={{ width: '36px', height: '36px' }}
                                />
                            </Grid>

                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    margin: 'auto',
                                    marginTop: '1em',
                                }}
                            >
                                <Typography
                                    sx={{
                                        display: 'flex',
                                        color: '#888',
                                        fontSize: '0.5em',
                                    }}
                                >
                                    GitHub
                                </Typography>
                            </Grid>
                        </Button>
                    </Box>
                    <Box sx={{ display: 'flex', width: '100%' }}>
                        <Button
                            variant="plain"
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                margin: 'auto',
                                padding: '1em',
                                minWidth: '6em',
                            }}
                            onClick={() =>
                                window.open('https://www.reddit.com/r/Affine/')
                            }
                        >
                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <RedditIcon
                                    sx={{ width: '36px', height: '36px' }}
                                />
                            </Grid>

                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    margin: 'auto',
                                    marginTop: '1em',
                                }}
                            >
                                <Typography
                                    sx={{
                                        display: 'flex',
                                        color: '#888',
                                        fontSize: '0.5em',
                                    }}
                                >
                                    Reddit
                                </Typography>
                            </Grid>
                        </Button>
                    </Box>
                    <Box
                        sx={{
                            display: 'flex',
                            width: '100%',
                        }}
                    >
                        <Button
                            variant="plain"
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                margin: 'auto',
                                padding: '1em',
                                minWidth: '6em',
                            }}
                            onClick={() =>
                                window.open('https://t.me/affineworkos')
                            }
                        >
                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <TelegramIcon
                                    sx={{ width: '36px', height: '36px' }}
                                />
                            </Grid>

                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    margin: 'auto',
                                    marginTop: '1em',
                                }}
                            >
                                <Typography
                                    sx={{
                                        display: 'flex',
                                        color: '#888',
                                        fontSize: '0.5em',
                                    }}
                                >
                                    Telegram
                                </Typography>
                            </Grid>
                        </Button>
                    </Box>
                    <Box sx={{ display: 'flex', width: '100%' }}>
                        <Button
                            variant="plain"
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                margin: 'auto',
                                padding: '1em',
                                minWidth: '6em',
                            }}
                            onClick={() =>
                                window.open('https://discord.gg/yz6tGVsf5p')
                            }
                        >
                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <DiscordIcon
                                    sx={{
                                        width: '36px',
                                        height: '36px',
                                        color: '#09449d',
                                    }}
                                />
                            </Grid>

                            <Grid
                                xs={12}
                                sx={{
                                    display: 'flex',
                                    margin: 'auto',
                                    marginTop: '1em',
                                }}
                            >
                                <Typography
                                    sx={{
                                        display: 'flex',
                                        color: '#888',
                                        fontSize: '0.5em',
                                    }}
                                >
                                    Discord
                                </Typography>
                            </Grid>
                        </Button>
                    </Box>
                </Box>
                <Grid xs={12} sx={{ display: 'flex', marginBottom: '2em' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            margin: 'auto',
                            textAlign: 'center',
                        }}
                    >
                        <Typography sx={{ display: 'flex', color: '#888' }}>
                            AFFiNE is an
                            <span
                                style={{
                                    color: '#5085f6cc',
                                    margin: 'auto 0.25em',
                                }}
                            >
                                #OpenSource
                            </span>
                            company
                        </Typography>
                    </Box>
                </Grid>
                <Grid xs={12} sx={{ display: 'flex', marginBottom: '2em' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            margin: 'auto',
                            textAlign: 'center',
                        }}
                    >
                        <Typography sx={{ display: 'flex', color: '#888' }}>
                            Copyright © 2022 AFFiNE.
                        </Typography>
                    </Box>
                </Grid>
            </VenusContainer>
        </CssVarsProvider>
    );
}

export default App;
