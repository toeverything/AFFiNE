import { useRef, useState, ReactElement } from 'react';
import {
    MuiGrow as Grow,
    MuiPopper as Popper,
    MuiPopperPlacementType as PopperPlacementType,
} from '../mui';
import { styled } from '../styled';
import { ArrowRightIcon } from '@toeverything/components/icons';
import { Divider } from '../divider';

export interface CascaderItemProps {
    title: string;
    shortcut?: string;
    callback?: () => void;
    subItems?: CascaderItemProps[];
    children?: ReactElement | Array<never>;
    icon?: ReactElement;
    isDivide?: boolean;
}

interface ItemProps extends CascaderItemProps {
    onClose?: () => void;
}

interface CascaderProps {
    items: ItemProps[];
    anchorEl: Element;
    placement: PopperPlacementType;
    open: boolean;
    onClose: () => void;
    children?: ReactElement | never[];
    icon?: ReactElement;
}

function CascaderItem(props: ItemProps) {
    const { title, subItems, callback, onClose, children, icon, isDivide } =
        props;
    const item_ref = useRef(null);
    const [open, setOpen] = useState(false);

    if (isDivide) {
        return <Divider></Divider>;
    }

    const on_click_item = () => {
        if ((subItems && subItems.length > 0) || children) {
            return;
        }
        callback && callback();
        onClose();
    };
    return (
        <CascaderMenuItem
            ref={item_ref}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onClick={() => on_click_item()}
        >
            <IconContainer>{icon}</IconContainer>
            <div style={{ display: 'flex', flexGrow: 1 }}>
                <div
                    style={{
                        flexGrow: 1,
                    }}
                >
                    {title}
                </div>
                {children || (subItems && subItems.length > 0) ? (
                    <Triangle>
                        <ArrowRightIcon />
                    </Triangle>
                ) : null}
            </div>
            {((subItems && subItems.length > 0) || children) && (
                <Cascader
                    items={subItems}
                    anchorEl={item_ref.current}
                    placement="right-start"
                    open={open}
                    onClose={onClose}
                    children={children}
                />
            )}
        </CascaderMenuItem>
    );
}

export function Cascader(props: CascaderProps) {
    const { items, anchorEl, placement, open, onClose, children } = props;
    return (
        <Popper
            open={open}
            anchorEl={anchorEl}
            role={undefined}
            placement={placement}
            transition
            style={{ zIndex: 1000 }}
            onMouseLeave={onClose}
        >
            {({ TransitionProps }) => (
                <Grow
                    {...TransitionProps}
                    style={{
                        transformOrigin: 'left bottom',
                    }}
                >
                    <MenuPaper>
                        {children ? children : null}
                        <ul>
                            {items.map(item => {
                                return (
                                    <CascaderItem
                                        key={item.title}
                                        title={item.title}
                                        shortcut={item.shortcut}
                                        callback={item.callback}
                                        subItems={item.subItems || []}
                                        onClose={onClose}
                                        children={item.children}
                                        icon={item.icon}
                                        isDivide={item.isDivide}
                                    />
                                );
                            })}
                        </ul>
                    </MenuPaper>
                </Grow>
            )}
        </Popper>
    );
}

const MenuPaper = styled('div')(({ theme }) => ({
    fontFamily: 'PingFang SC',
    background: '#FFF',
    boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
    borderRadius: '10px 0px 10px 10px',
    color: '#4C6275',
    fontWeight: '400',
    padding: '4px 8px',
}));

const CascaderMenuItem = styled('li')(({ theme }) => ({
    fontWeight: '400 !important',
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

const Triangle = styled('div')(({ theme }) => ({
    display: 'flex',
    height: '32px',
    marginRight: '8px',
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
