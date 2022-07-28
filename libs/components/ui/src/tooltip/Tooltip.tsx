import { forwardRef, type PropsWithChildren, type CSSProperties } from 'react';
import { type PopperHandler, type PopperProps, Popper } from '../popper';
import { PopoverContainer, placementToContainerDirection } from '../popover';
import type { TooltipProps } from './interface';
import { useTheme } from '../theme';

const useTooltipStyle = (): CSSProperties => {
    const theme = useTheme();
    return {
        backgroundColor: theme.affine.palette.icons,
        color: theme.affine.palette.white,
        ...theme.affine.typography.tooltip,
        padding: '4px 8px',
    };
};

export const Tooltip = forwardRef<
    PopperHandler,
    PropsWithChildren<PopperProps & TooltipProps>
>((props, ref) => {
    const { content, placement = 'top-start' } = props;
    const style = useTooltipStyle();
    // 如果没有内容，则永远隐藏
    const visibleProp = content ? {} : { visible: false };
    return (
        <Popper
            ref={ref}
            {...visibleProp}
            placement="top"
            {...props}
            showArrow={false}
            content={
                <PopoverContainer
                    style={style}
                    direction={placementToContainerDirection[placement]}
                >
                    {content}
                </PopoverContainer>
            }
        />
    );
});
