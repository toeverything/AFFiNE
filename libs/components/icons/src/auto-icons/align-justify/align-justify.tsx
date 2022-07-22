
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface AlignJustifyIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AlignJustifyIcon: FC<AlignJustifyIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M2 4h20v1.6H2V4ZM2 9h20v1.6H2V9ZM22 15H2v-1.6h20V15ZM22 20H2v-1.6h20V20Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
