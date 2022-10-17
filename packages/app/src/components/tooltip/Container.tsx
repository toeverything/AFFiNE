import { styled } from '@/styles';
import type { ReactNode, CSSProperties } from 'react';
import type { PopoverDirection } from './interface';
export interface PopoverContainerProps {
  children?: ReactNode;
  /**
   * The pop-up window points to. The pop-up window has three rounded corners, one is a right angle, and the right angle is the direction of the pop-up window.
   */
  direction: PopoverDirection;
  style?: CSSProperties;
}
const border_radius_map: Record<PopoverContainerProps['direction'], string> = {
  none: '10px',
  'left-top': '0 10px 10px 10px',
  'left-bottom': '10px 10px 10px 0',
  'right-top': '10px 0 10px 10px',
  'right-bottom': '10px 10px 0 10px',
};

export const PopoverContainer = styled('div')<
  Pick<PopoverContainerProps, 'direction'>
>(({ direction, style }) => {
  const borderRadius =
    border_radius_map[direction] || border_radius_map['left-top'];
  return {
    borderRadius: borderRadius,
    ...style,
  };
});
