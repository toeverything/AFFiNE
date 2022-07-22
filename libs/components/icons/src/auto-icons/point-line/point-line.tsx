
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface PointLineIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const PointLineIcon: FC<PointLineIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path d="M20.324 4.485a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99ZM11.273 13.536a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99ZM15.799 9.01a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99ZM6.748 18.062a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99ZM18.062 6.748a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99ZM9.01 15.799a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99ZM13.536 11.273a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99ZM4.485 20.325a.7.7 0 1 1-.99-.99.7.7 0 0 1 .99.99Z" />
        </SvgIcon>
    )
};
