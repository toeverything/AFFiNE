
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface MoreIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const MoreIcon: FC<MoreIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <circle cx={12} cy={5.5} r={1.5} /><circle cx={12} cy={12} r={1.5} /><circle cx={12} cy={18.5} r={1.5} />
        </SvgIcon>
    )
};
