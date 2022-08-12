import clsx from 'clsx';
import style9 from 'style9';

import { SvgIconProps } from '../svg-icon';
import { BaseButton } from './base-button';

const styles = style9.create({
    item: {
        display: 'flex',
        alignItems: 'center',
        width: '220px',
        paddingLeft: '22px',
        paddingTop: '4px',
        paddingBottom: '4px',
        marginTop: '6px',
        marginBottom: '6px',
        borderRadius: '5px',
        color: '#98ACBD',
    },
    item_hover: {
        backgroundColor: 'rgba(152, 172, 189, 0.1)',
    },
    item_text: {
        fontSize: '15px',
        lineHeight: '17px',
        textAlign: 'justify',
        letterSpacing: '1.5px',
        marginLeft: '8px',
        color: '#4C6275',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
    },
});

type ListButtonProps = {
    className?: string;
    onClick: () => void;
    onMouseOver?: () => void;
    content?: string;
    children?: () => JSX.Element;
    hover?: boolean;
    icon?: (prop: SvgIconProps) => JSX.Element;
};

export const ListButton = (props: ListButtonProps) => {
    const MenuIcon = props.icon;
    return (
        <BaseButton
            onClick={props.onClick}
            onMouseOver={props.onMouseOver}
            className={clsx(
                styles('item', { item_hover: props.hover }),
                props.className
            )}
        >
            {MenuIcon && <MenuIcon sx={{ width: 20, height: 20 }} />}
            <span className={styles('item_text')}>{props.content}</span>
            {props.children}
        </BaseButton>
    );
};
