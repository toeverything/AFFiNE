import { styled } from '../styled';
import { PopoverContainerProps } from './interface';

const border_radius_map: Record<PopoverContainerProps['direction'], string> = {
    none: '10px',
    'left-top': '0 10px 10px 10px',
    'left-bottom': '10px 10px 10px 0',
    'right-top': '10px 0 10px 10px',
    'right-bottom': '10px 10px 0 10px',
};

export const PopoverContainer = styled('div')<
    Pick<PopoverContainerProps, 'direction'>
>(({ theme, direction, style }) => {
    const shadow = theme.affine.shadows.shadowSxDownLg;
    const white = theme.affine.palette.white;

    const border_radius =
        border_radius_map[direction] || border_radius_map['left-top'];
    return {
        boxShadow: shadow,
        borderRadius: border_radius,
        padding: '8px 4px',
        backgroundColor: white,
        ...style,
    };
});
