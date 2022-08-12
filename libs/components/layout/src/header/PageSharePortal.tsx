import InsertLinkIcon from '@mui/icons-material/InsertLink';
import LanguageIcon from '@mui/icons-material/Language';
import ShareIcon from '@mui/icons-material/Share';
import {
    MuiButton as Button,
    MuiInputBase as InputBase,
    MuiPaper as Paper,
    MuiSnackbar as Snackbar,
    MuiSwitch as Switch,
    Popover,
} from '@toeverything/components/ui';
import { copyToClipboard } from '@toeverything/utils';
import { useState } from 'react';
import style9 from 'style9';

const styles = style9.create({
    pageShareBox: {
        width: '500px',
        padding: '30px 20px 50px 20px',
    },
    btnPageShare: {
        width: '24px',
        height: '24px',
    },
    pageShareBoxIcon: {
        position: 'absolute',
        left: '5px',
        top: '10px',
        color: 'var(--color-gray-400)',
    },
    pageShareBoxForWeb: {
        position: 'relative',
        paddingLeft: '40px',
        borderBottom: '1px solid var(--color-gray-400))',
        marginBottom: '15px',
    },
    pageShareBoxSwitch: {
        position: 'absolute',
        right: '5px',
        top: '10px',
    },
    pageShareBoxForWebP1: {
        fontWeight: 'bold',
        marginBottom: '5px',
    },
    pageShareBoxForWebP2: {
        color: 'var(--color-gray-400)',
    },
    copyLinkBtn: {
        marginTop: '15px',
        float: 'right',
        cursor: 'pointer',
    },
    copyLinkcon: {
        verticalAlign: 'middle',
    },
});
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
                    <div className={styles('pageShareBox')}>
                        <div className={styles('pageShareBoxForWeb')}>
                            <LanguageIcon
                                className={styles('pageShareBoxIcon')}
                            />
                            <p className={styles('pageShareBoxForWebP1')}>
                                {MESSAGES.SHARE_TO_WEB}
                            </p>
                            <p className={styles('pageShareBoxForWebP2')}>
                                {MESSAGES.SHARE_TO_ANYONE}
                            </p>
                            <div className={styles('pageShareBoxSwitch')}>
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
                            <a
                                className={styles('copyLinkBtn')}
                                onClick={handleCopy}
                            >
                                <InsertLinkIcon
                                    className={styles('copyLinkcon')}
                                />
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
