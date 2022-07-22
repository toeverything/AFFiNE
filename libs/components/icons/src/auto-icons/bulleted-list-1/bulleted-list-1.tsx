
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface BulletedList_1IconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BulletedList_1Icon: FC<BulletedList_1IconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <circle cx={12} cy={12} r={2} />
        </SvgIcon>
    )
};
