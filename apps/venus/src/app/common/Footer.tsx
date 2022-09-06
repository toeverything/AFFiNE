/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/naming-convention */
import { useTranslation } from 'react-i18next';

import { Box, Button, Grid, Typography } from '@mui/joy';

import GitHubIcon from '@mui/icons-material/GitHub';
import RedditIcon from '@mui/icons-material/Reddit';
import TelegramIcon from '@mui/icons-material/Telegram';
import TwitterIcon from '@mui/icons-material/Twitter';

import { DiscordIcon, GitHub } from '../Icons';
import LogoImage from '../logo.png';
import { AFFiNEImage } from './index';

export const AFFiNEFooter = ({
    keepupdate = true,
}: {
    keepupdate?: boolean;
}) => {
    const { t } = useTranslation();

    return (
        <>
            {keepupdate ? (
                <>
                    <Grid xs={12} sx={{ display: 'flex' }}>
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                margin: 'auto',
                            }}
                        >
                            <AFFiNEImage src={LogoImage} alt="AFFiNE Logo" />
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
                </>
            ) : null}
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
                            window.open('https://twitter.com/AffineOfficial')
                        }
                    >
                        <Grid
                            xs={12}
                            sx={{
                                display: 'flex',
                                justifyContent: 'center',
                            }}
                        >
                            <TwitterIcon
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
                                Twitter
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
                        onClick={() => window.open('https://t.me/affineworkos')}
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
        </>
    );
};
