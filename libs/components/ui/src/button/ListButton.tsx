import React from 'react';

import { BaseButton } from './base-button';
import { SvgIconProps } from '../svg-icon';

const itemStyle: React.CSSProperties = {
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
};
const itemHoverStyle: React.CSSProperties = {
    backgroundColor: 'rgba(152, 172, 189, 0.1)',
};
const itemTextStyle: React.CSSProperties = {
    fontSize: '15px',
    lineHeight: '17px',
    textAlign: 'justify',
    letterSpacing: '1.5px',
    marginLeft: '8px',
    color: '#4C6275',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
};

type ListButtonProps = {
    className?: string;
    style?: React.CSSProperties;
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
            style={{ ...itemStyle, ...(props.hover ? itemHoverStyle : {}) }}
            className={props.className}
        >
            {MenuIcon && <MenuIcon sx={{ width: 20, height: 20 }} />}
            <span style={itemTextStyle}>{props.content}</span>
            {props.children}
        </BaseButton>
    );
};
