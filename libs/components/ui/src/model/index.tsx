import ModalUnstyled from '@mui/base/ModalUnstyled';
import { styled } from '@mui/system';
// eslint-disable-next-line no-restricted-imports
import Fade from '@mui/material/Fade';

import { MuiClickAwayListener } from '../mui';

const Modal = styled(ModalUnstyled)`
    position: fixed;
    z-index: 1300;
    right: 0;
    bottom: 0;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
`;

type TransitionsModalProps = {
    open: boolean;
    onClose: () => void;
    children: JSX.Element;
};

export const TransitionsModal = (props: TransitionsModalProps) => {
    return (
        <Modal
            aria-labelledby="transition-modal-title"
            aria-describedby="transition-modal-description"
            open={props.open}
            onClose={props.onClose}
            closeAfterTransition
        >
            <MuiClickAwayListener onClickAway={props.onClose}>
                <Fade in={props.open} timeout={300}>
                    {props.children}
                </Fade>
            </MuiClickAwayListener>
        </Modal>
    );
};
