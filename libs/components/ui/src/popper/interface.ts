import type { CSSProperties, ReactNode, Ref } from 'react';
/* eslint-disable no-restricted-imports */
import {
    type PopperPlacementType,
    type PopperUnstyledProps,
} from '@mui/base/PopperUnstyled';
export type VirtualElement = {
    getBoundingClientRect: () => ClientRect | DOMRect;
    contextElement?: Element;
};

export type PopperHandler = {
    setVisible: (visible: boolean) => void;
};

export type PopperArrowProps = {
    placement: PopperPlacementType;
};

export type PopperProps = {
    // Popover content
    content: ReactNode;

    // Popover trigger
    children?: ReactNode;

    // Whether the default is implicit
    defaultVisible?: boolean;

    // Used to manually control the visibility of the Popover
    visible?: boolean;

    // TODO: support focus
    trigger?: 'hover' | 'click' | 'focus' | ('click' | 'hover' | 'focus')[];

    // How long does it take for the mouse to display the Popover, in milliseconds
    pointerEnterDelay?: number;

    // How long does it take to hide the Popover after the mouse moves out, in milliseconds
    pointerLeaveDelay?: number;

    // Callback fired when the component closed or open
    onVisibleChange?: (visible: boolean) => void;

    // Popover container style
    popoverStyle?: CSSProperties;

    // Popover container class name
    popoverClassName?: string;

    // Anchor style
    anchorStyle?: CSSProperties;

    // Anchor class name
    anchorClassName?: string;

    // Popover z-index
    zIndex?: number;

    offset?: [number, number];

    showArrow?: boolean;

    popperHandlerRef?: Ref<PopperHandler>;
} & Omit<PopperUnstyledProps, 'open' | 'ref'>;
