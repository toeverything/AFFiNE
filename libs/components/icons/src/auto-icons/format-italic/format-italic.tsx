
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface FormatItalicIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FormatItalicIcon: FC<FormatItalicIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M10 3h9v1.6h-3.668l-5.224 14.8H14V21H5v-1.6h3.412l5.223-14.8H10V3Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
