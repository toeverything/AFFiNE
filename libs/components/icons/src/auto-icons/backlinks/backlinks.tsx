
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface BacklinksIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BacklinksIcon: FC<BacklinksIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M3.2 3.2H10v1.6H4.8v14.4H10v1.6H3.2V3.2ZM14.2 3.2H21v1.6h-5.2v14.4H21v1.6h-6.8V3.2Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
