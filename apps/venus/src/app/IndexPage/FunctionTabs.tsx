import { Box, Grid, Typography } from '@mui/joy';
import { useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { Paper, Slide, Tab, Tabs, useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AFFiNEImage } from '../common';
import ShapeImage from './shape.png';
import TaskImage from './task.png';

export const FunctionTabs = () => {
    const matches = useMediaQuery('(max-width: 1024px)');
    const { t } = useTranslation();
    const [tab, selectTab] = useState(0);
    return (
        <Paper
            sx={{
                // backgroundColor: 'rgba(54, 100, 214, 0.05)',
                padding: '10px',
                position: 'relative',
                height: '700px',
            }}
            elevation={0}
        >
            <Tabs
                value={tab}
                onChange={(_, value) => selectTab(value)}
                centered
            >
                <Tab label={t('description2.part1')} value={0} />
                <Tab label={t('description3.part1')} value={1} />
            </Tabs>
            <Slide direction="left" in={tab === 0} mountOnEnter unmountOnExit>
                <Grid
                    xs={12}
                    sx={{
                        display: 'flex',
                        flexDirection: matches ? 'column' : 'row',
                        marginBottom: '12em',
                        position: 'absolute',
                        top: '100px',
                        left: 0,
                        width: '100%',
                    }}
                >
                    <Grid
                        xs={matches ? 12 : 3}
                        sx={{
                            display: 'flex',
                            paddingLeft: '20px',
                            flex: 1,
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
                                style={{ marginBottom: '0.5em' }}
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
                        sx={{ display: 'flex', width: '100%', flex: 2 }}
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
            </Slide>
            <Slide direction="left" in={tab === 1} mountOnEnter unmountOnExit>
                <Grid
                    xs={12}
                    sx={{
                        display: 'flex',
                        flexDirection: matches ? 'column' : 'row-reverse',
                        position: 'absolute',
                        top: '100px',
                        left: 0,
                        width: '100%',
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
            </Slide>
        </Paper>
    );
};
