import { type PropsWithChildren } from 'react';
import type { MuiPopperPlacementType as PopperPlacementType } from '../mui';
import { Popper } from '../popper';
import { PopoverContainer } from './Container';
import type { PopoverDirection, PopoverProps } from './interface';

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

export const Popover = (props: PropsWithChildren<PopoverProps>) => {
    const { popoverDirection, placement, content, children, style } = props;
    return (
        <Popper
            {...props}
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
};
