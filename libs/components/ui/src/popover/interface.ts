import type { CSSProperties, ReactNode } from 'react';
import { PopperProps } from '../popper';

export type PopoverDirection =
    | 'none'
    | 'left-top'
    | 'left-bottom'
    | 'right-top'
    | 'right-bottom';

export interface PopoverContainerProps {
    children?: ReactNode;
    /**
     * The pop-up window points to. The pop-up window has three rounded corners, one is a right angle, and the right angle is the direction of the pop-up window.
     */
    direction?: PopoverDirection;
    style?: CSSProperties;
}
export type PopoverProps = {
    // Popover border-radius style will auto set by placement, popoverDirection can custom set it
    popoverDirection?: PopoverDirection;
    style?: CSSProperties;
} & PopperProps;
