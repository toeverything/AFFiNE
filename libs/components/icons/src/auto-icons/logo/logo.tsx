
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface LogoIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const LogoIcon: FC<LogoIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M10.71 1 3 23h4.516L12.42 7.784 17.327 23h4.5l-7.71-22H10.71Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
