
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface Rectangle_93IconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const Rectangle_93Icon: FC<Rectangle_93IconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path strokeWidth={2} d="M1 1H1676V1086H1z" />
        </SvgIcon>
    )
};
