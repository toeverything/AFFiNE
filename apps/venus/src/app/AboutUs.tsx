import { Box, Grid, Typography } from '@mui/joy';

import 'github-markdown-css/github-markdown-light.css';

import AboutText from './about.mdx';
import { AFFiNEFooter, AFFiNEHeader, AFFiNEImage } from './common';
import KeepUpdate from './keeupdate.png';

export const AboutUs = () => {
    return (
        <>
            <AFFiNEHeader />
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
