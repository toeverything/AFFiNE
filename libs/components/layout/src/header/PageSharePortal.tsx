import LanguageIcon from '@mui/icons-material/Language';
import { useState, MouseEvent } from 'react';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import ShareIcon from '@mui/icons-material/Share';
import {
    MuiSnackbar as Snackbar,
    MuiButton as Button,
    MuiDivider as Divider,
    MuiInputBase as InputBase,
    MuiPaper as Paper,
    MuiSwitch as Switch,
    Popover,
} from '@toeverything/components/ui';
import { copyToClipboard } from '@toeverything/utils';

const pageShareBoxStyle: React.CSSProperties = {
    width: '500px',
    padding: '30px 20px 50px 20px',
};

const btnPageShareStyle: React.CSSProperties = {
    width: '24px',
    height: '24px',
};

const pageShareBoxIconStyle: React.CSSProperties = {
    position: 'absolute',
    left: '5px',
    top: '10px',
    color: 'var(--color-gray-400)',
};

const pageShareBoxForWebStyle: React.CSSProperties = {
    position: 'relative',
    paddingLeft: '40px',
    borderBottom: '1px solid var(--color-gray-400))',
    marginBottom: '15px',
};

const pageShareBoxSwitchStyle: React.CSSProperties = {
    position: 'absolute',
    right: '5px',
    top: '10px',
};

const pageShareBoxForWebP1Style: React.CSSProperties = {
    fontWeight: 'bold',
    marginBottom: '5px',
};

const pageShareBoxForWebP2Style: React.CSSProperties = {
    color: 'var(--color-gray-400)',
};

const copyLinkBtnStyle: React.CSSProperties = {
    marginTop: '15px',
    float: 'right',
    cursor: 'pointer',
};

const copyLinkconStyle: React.CSSProperties = {
    verticalAlign: 'middle',
};

const MESSAGES = {
    COPY_LINK: ' Copy Link',
    INVITE: 'Add people,emails, or groups',
    SHARE_TO_WEB: 'Share to web',
    SHARE_TO_ANYONE: 'Publish and share link with any one',
    COPY_LINK_SUCCESS: 'Copyed link to clipboard',
};
function PageSharePortal() {
    const [alertOpen, setAlertOpen] = useState(false);
    const handleCopy = () => {
        copyToClipboard(window.location.href);
        setAlertOpen(true);
    };
    const handleAlertClose = () => {
        setAlertOpen(false);
    };

    return (
        <div>
            <Popover
                placement="bottom-start"
                trigger="click"
                content={
                    <div style={pageShareBoxStyle}>
                        <div style={pageShareBoxForWebStyle}>
                            <LanguageIcon style={pageShareBoxIconStyle} />
                            <p style={pageShareBoxForWebP1Style}>
                                {MESSAGES.SHARE_TO_WEB}
                            </p>
                            <p style={pageShareBoxForWebP2Style}>
                                {MESSAGES.SHARE_TO_ANYONE}
                            </p>
                            <div style={pageShareBoxSwitchStyle}>
                                <Switch />
                            </div>
                        </div>

                        <div>
                            <Paper
                                component="form"
                                sx={{
                                    p: '0px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    width: 460,
                                }}
                            >
                                <InputBase
                                    sx={{ ml: 1, flex: 1 }}
                                    placeholder={MESSAGES.INVITE}
                                />
                                <Button variant="contained">Invite</Button>
                            </Paper>
                        </div>
                        <div>
                            <a style={copyLinkBtnStyle} onClick={handleCopy}>
                                <InsertLinkIcon style={copyLinkconStyle} />
                                {MESSAGES.COPY_LINK}
                            </a>
                        </div>
                        <Snackbar
                            anchorOrigin={{
                                vertical: 'bottom',
                                horizontal: 'center',
                            }}
                            open={alertOpen}
                            message={MESSAGES.COPY_LINK_SUCCESS}
                            key={'bottomcenter'}
                            autoHideDuration={2000}
                            onClose={handleAlertClose}
                        />
                    </div>
                }
            >
                <ShareIcon style={{ marginTop: '8px' }} />
            </Popover>
        </div>
    );
}

export { PageSharePortal };
