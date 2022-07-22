
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SolidLineIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SolidLineIcon: FC<SolidLineIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M3 20 20 3l.99.99-17 17L3 20Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
