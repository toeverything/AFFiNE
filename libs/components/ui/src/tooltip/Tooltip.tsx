import React, {
    forwardRef,
    type PropsWithChildren,
    type CSSProperties,
    useState,
} from 'react';
import { type PopperHandler, type PopperProps, Popper } from '../popper';
import type { TooltipProps } from './interface';
import { useTheme } from '../theme';

const useTooltipStyle = (): CSSProperties => {
    const theme = useTheme();
    return {
        backgroundColor: theme.affine.palette.icons,
        color: theme.affine.palette.white,
        ...theme.affine.typography.tooltip,
        padding: '4px 8px',
        borderRadius: theme.shape.borderRadius,
    };
};

export const Tooltip = forwardRef<
    PopperHandler,
    PropsWithChildren<PopperProps & TooltipProps>
>((props, ref) => {
    const style = useTooltipStyle();
    return (
        <Popper
            ref={ref}
            popoverStyle={style}
            placement="top"
            showArrow
            {...props}
        />
    );
});
