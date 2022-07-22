import type { CSSProperties, ReactNode } from 'react';
import type { MuiPopperPlacementType as PopperPlacementType } from '../mui';

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
    // Position of Popover
    placement?: PopperPlacementType;

    // The popover will pop up based on the anchor position
    // And if this parameter is passed, children will not be rendered
    anchor?: VirtualElement | (() => VirtualElement);

    // Whether the default is implicit
    defaultVisible?: boolean;

    // Used to manually control the visibility of the Popover
    visible?: boolean;

    // A HTML element or function that returns one. The container will have the portal children appended to it.
    // By default, it uses the body of the top-level document object, so it's simply document.body most of the time.
    container?: HTMLElement;

    // Always keep the children in the DOM. This prop can be useful in SEO situation or when you want to maximize the responsiveness of the Popper
    keepMounted?: boolean;

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
};
