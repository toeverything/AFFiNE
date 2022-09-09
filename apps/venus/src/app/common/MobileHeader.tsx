import Close from '@mui/icons-material/Close';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import GitHubIcon from '@mui/icons-material/GitHub';
import Menu from '@mui/icons-material/Menu';
import { Button, Grid } from '@mui/joy';
import { useRef, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import {
    Checkbox,
    Collapse,
    Drawer,
    List,
    ListItemButton,
    ListItemText,
    styled,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AFFiNETextLogo from './affine-text-logo.png';

export const MobileHeader = () => {
    const navigate = useNavigate();
    const { i18n, t } = useTranslation();
    const anchor = useRef<HTMLDivElement | null>(null);
    const [openedDrawer, setDrawerState] = useState(false);
    const handleDrawerOpenState = () => {
        setDrawerState(!openedDrawer);
    };
    const [contactUsCollapse, setContactUsCollapse] = useState(false);
    const handleContactUsClick = () => {
        setContactUsCollapse(!contactUsCollapse);
    };

    const [languageCollapse, setLanguageCollapse] = useState(false);
    const handleLanguageClick = () => {
        setLanguageCollapse(!languageCollapse);
    };

    return (
        <Container ref={anchor} container spacing={2}>
            <Grid
                xs={12}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <StyledImage
                    src={AFFiNETextLogo}
                    alt="affine"
                    onClick={() => navigate('/')}
                />
                <div>
                    <Button
                        variant="plain"
                        onClick={() =>
                            window.open(
                                'https://github.com/toeverything/AFFiNE'
                            )
                        }
                    >
                        <GitHubIcon />
                    </Button>
                    <Button onClick={handleDrawerOpenState} variant="plain">
                        {openedDrawer ? <Close /> : <Menu />}
                    </Button>
                </div>
            </Grid>
            <Drawer
                anchor="top"
                open={openedDrawer}
                onClose={() => setDrawerState(false)}
            >
                <StyledDrawerContainer>
                    <List>
                        <ListItemButton onClick={() => navigate('/aboutus')}>
                            <ListItemText primary={t('AboutUs') as string} />
                        </ListItemButton>
                        <ListItemButton
                            onClick={() =>
                                window.open('https://blog.affine.pro')
                            }
                        >
                            <ListItemText primary={t('Blog') as string} />
                        </ListItemButton>
                        <ListItemButton
                            onClick={() =>
                                window.open('https://docs.affine.pro/')
                            }
                        >
                            <ListItemText primary={t('Docs') as string} />
                        </ListItemButton>
                        <ListItemButton
                            onClick={() =>
                                window.open('https://feedback.affine.pro/')
                            }
                        >
                            <ListItemText primary={t('Feedback') as string} />
                        </ListItemButton>
                        <ListItemButton onClick={handleContactUsClick}>
                            <ListItemText primary={t('ContactUs') as string} />
                            {contactUsCollapse ? (
                                <ExpandLess />
                            ) : (
                                <ExpandMore />
                            )}
                        </ListItemButton>
                        <Collapse
                            in={contactUsCollapse}
                            timeout="auto"
                            unmountOnExit
                        >
                            <ListItemButton
                                onClick={() =>
                                    window.open('https://discord.gg/Arn7TqJBvG')
                                }
                            >
                                <ListItemText primary="Discord" />
                            </ListItemButton>
                            <ListItemButton
                                onClick={() =>
                                    window.open('https://t.me/affineworkos')
                                }
                            >
                                <ListItemText primary="Telegram" />
                            </ListItemButton>
                            <ListItemButton
                                onClick={() =>
                                    window.open(
                                        'https://www.reddit.com/r/Affine/'
                                    )
                                }
                            >
                                <ListItemText primary="Reddit" />
                            </ListItemButton>
                            <ListItemButton
                                onClick={() =>
                                    window.open(
                                        'https://medium.com/@affineworkos'
                                    )
                                }
                            >
                                <ListItemText primary="Medium" />
                            </ListItemButton>
                            <ListItemButton
                                onClick={() =>
                                    window.open(
                                        'mailto:contact@toeverything.info'
                                    )
                                }
                            >
                                <ListItemText primary="Email" />
                            </ListItemButton>
                        </Collapse>
                        <ListItemButton onClick={handleLanguageClick}>
                            <ListItemText primary={t('language') as string} />
                            {languageCollapse ? <ExpandLess /> : <ExpandMore />}
                        </ListItemButton>
                        <Collapse
                            in={languageCollapse}
                            timeout="auto"
                            unmountOnExit
                        >
                            <ListItemButton
                                onClick={() => i18n.changeLanguage('en')}
                            >
                                <ListItemText primary="English" />
                                <Checkbox checked={i18n.language === 'en'} />
                            </ListItemButton>
                            <ListItemButton
                                onClick={() => i18n.changeLanguage('zh')}
                            >
                                <ListItemText primary="简体中文" />
                                <Checkbox checked={i18n.language === 'zh'} />
                            </ListItemButton>
                        </Collapse>
                    </List>
                </StyledDrawerContainer>
            </Drawer>
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

const StyledImage = styled('img')({
    height: '24px',
    marginRight: '16px',
    cursor: 'pointer',
});

const StyledDrawerContainer = styled('div')({
    paddingTop: '72px',
});
