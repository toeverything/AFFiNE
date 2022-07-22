import {
    styled,
    MuiBox as Box,
    MuiModal as Modal,
} from '@toeverything/components/ui';

import * as React from 'react';
import { Templates } from '../../templates';
import StarIcon from '@mui/icons-material/Star';
import { useNavigate } from 'react-router';
import { AsyncBlock } from '@toeverything/framework/virgo';
import { createEditor } from '@toeverything/components/affine-editor';
const TemplatePortalContainer = styled('div')({
    position: 'relative',
    marginLeft: '10px',
    height: '22px',
    lineHeight: '22px',
    width: '220px',
    borderRadius: '8px',
    color: '#4c6275',
    fontSize: '14px',
    paddingLeft: '20px',
    cursor: 'pointer',
    ':hover': {
        backgroundColor: '#ccc',
    },
    '.shortcutIcon': {
        position: 'absolute',
        top: '3px',
        left: '0px',
        fontSize: '16px!important',
    },
});

const style = {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '80%',
    height: '70%',
    boxShadow: 0,
    p: 0,
};
const maskStyle = {
    background: 'rgba(0,0,0,0.5)',
    width: '100%',
    height: '100%',
    position: 'fixed',
};
function TemplatesPortal() {
    const [open, set_open] = React.useState(false);
    const handle_open = () => set_open(true);
    const handle_close = () => set_open(false);
    const navigate = useNavigate();

    const get_default_workspace_id = () => {
        return window.location.pathname.split('/')[1];
    };
    const handleClickUseThisTemplate = () => {
        const block_editor = createEditor(get_default_workspace_id());
        //@ts-ignore
        block_editor.plugins
            .getPlugin('page-toolbar')
            //@ts-ignore 泛型处理
            .addDailyNote()
            .then((new_page: AsyncBlock) => {
                handle_close();
                const new_state =
                    `/${get_default_workspace_id()}/` + new_page.id;
                navigate(new_state);
            });
    };
    return (
        <>
            <TemplatePortalContainer onClick={handle_open}>
                <StarIcon className="shortcutIcon" /> Templates
            </TemplatePortalContainer>
            <Modal open={open} onClose={handle_close}>
                <Box sx={style}>
                    <Templates
                        handleClickUseThisTemplate={handleClickUseThisTemplate}
                    />
                </Box>
            </Modal>
        </>
    );
}

export default TemplatesPortal;
