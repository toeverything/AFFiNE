import type { MuiPopperPlacementType as PopperPlacementType } from '../mui';
import React, { forwardRef, type PropsWithChildren } from 'react';
import { type PopperHandler, Popper } from '../popper';
import { PopoverContainer } from './Container';
import type { PopoverProps, PopoverDirection } from './interface';

export const placementToContainerDirection: Record<
    PopperPlacementType,
    PopoverDirection
> = {
    top: 'none',
    'top-start': 'left-bottom',
    'top-end': 'right-bottom',
    right: 'none',
    'right-start': 'left-top',
    'right-end': 'left-bottom',
    bottom: 'none',
    'bottom-start': 'left-top',
    'bottom-end': 'right-top',
    left: 'none',
    'left-start': 'right-top',
    'left-end': 'right-bottom',
    auto: 'none',
    'auto-start': 'none',
    'auto-end': 'none',
};

export const Popover = forwardRef<
    PopperHandler,
    PropsWithChildren<PopoverProps>
>((props, ref) => {
    const { popoverDirection, placement, content, children, style } = props;
    return (
        <Popper
            {...props}
            ref={ref}
            content={
                <PopoverContainer
                    style={style}
                    direction={
                        popoverDirection ||
                        placementToContainerDirection[placement]
                    }
                >
                    {content}
                </PopoverContainer>
            }
        >
            {children}
        </Popper>
    );
});
