import { AsyncBlock, Virgo } from '@toeverything/components/editor-core';
import { DeleteCashBinIcon } from '@toeverything/components/icons';
import { Popover, styled } from '@toeverything/components/ui';
import { Point } from '@toeverything/utils';
import { PropsWithChildren } from 'react';
import { ICON_WIDTH } from './DragItem';

type MenuProps = {
    visible: boolean;
    setVisible: (visible: boolean) => void;
    setGroupBlock: (groupBlock: AsyncBlock | null) => void;
    position: Point;
    editor: Virgo;
    groupBlock: AsyncBlock;
    menuRef: React.RefObject<HTMLUListElement>;
};

export const Menu = ({
    children,
    position,
    groupBlock,
    setVisible,
    visible,
    setGroupBlock,
    menuRef,
}: PropsWithChildren<MenuProps>) => {
    const handlerDeleteGroup = () => {
        groupBlock.remove();
        setVisible(false);
        setGroupBlock(null);
    };

    const Content = () => {
        return (
            <MenuUl ref={menuRef}>
                <MenuItem onClick={handlerDeleteGroup}>
                    <IconContainer>
                        <DeleteCashBinIcon />
                    </IconContainer>
                    Delete
                </MenuItem>
            </MenuUl>
        );
    };

    return (
        <Popover
            content={<Content />}
            placement={'bottom-start'}
            visible={visible}
            anchorStyle={{
                position: 'absolute',
                top: position.y,
                left: position.x - ICON_WIDTH,
                height: ICON_WIDTH,
            }}
        >
            {children}
        </Popover>
    );
};

const MenuUl = styled('ul')(({ theme }) => ({
    fontFamily: 'PingFang SC',
    background: '#FFF',
    color: '#4C6275',
    fontWeight: '400',
}));

const MenuItem = styled('li')(({ theme }) => ({
    fontWeight: '400',
    width: '268px',
    height: '32px',
    lineHeight: '32px',
    display: 'flex',
    fontSize: '14px',
    borderRadius: '5px',
    cursor: 'pointer',
    '&:hover': {
        backgroundColor: '#F5F7F8',
    },
}));

const IconContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    height: '32px',
    margin: '0 8px',
    flexDirection: 'column',
    justifyContent: 'center',
    lineHeight: '32px',
    fontSize: '20px',
    '&, & > svg': {
        width: '20px',
    },
    '& > svg': {
        height: '20px',
    },
}));
