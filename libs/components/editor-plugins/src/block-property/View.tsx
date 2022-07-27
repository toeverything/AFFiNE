import React, { StrictMode, useState } from 'react';
import { BlockDomInfo } from '@toeverything/framework/virgo';
import style9 from 'style9';
import { styled } from '@toeverything/components/ui';
import { Add } from '@mui/icons-material';

export default (props: {
    blockDomInfo: BlockDomInfo;
    setIsHover: (isHover: boolean) => void;
}) => {
    const { blockDomInfo, setIsHover } = props;

    const [showPopover, setShowPopover] = useState(false);
    return (
        <StrictMode>
            <div
                onMouseOver={() => {
                    setShowPopover(true);
                    setIsHover(true);
                }}
                onMouseLeave={() => {
                    setShowPopover(false);
                    setIsHover(false);
                }}
            >
                <div className={styles('triggerLine')} />
                <div
                    className={styles('popover', {
                        popoverShow: showPopover,
                    })}
                >
                    <Add />
                </div>
            </div>
        </StrictMode>
    );
};
const Container = styled('div')({
    background: 'blue',
    '&:hover .popover': {
        background: 'red',
        display: 'flex',
    },
});

const styles = style9.create({
    popover: {
        backgroundColor: '#fff',
        display: 'none',
        boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
        padding: '8px',
        borderRadius: '0 8px 8px 8px',
        position: 'absolute',
    },
    popoverShow: {
        display: 'flex',
    },
    triggerLine: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: '4px',
        width: '20px',
        backgroundColor: '#aaa',
        cursor: 'pointer',
    },
});
