
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface HandleParentIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const HandleParentIcon: FC<HandleParentIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <circle cx={9.296} cy={12} r={1.296} /><circle cx={14.482} cy={12} r={1.296} /><circle cx={9.296} cy={7.463} r={1.296} /><circle cx={14.482} cy={7.463} r={1.296} /><circle cx={9.296} cy={16.537} r={1.296} /><circle cx={14.482} cy={16.537} r={1.296} />
        </SvgIcon>
    )
};
