
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
        <path fillRule="evenodd" d="M10.962 2 4 22h4.078l4.428-13.833L16.936 22H21L14.037 2h-3.075Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
