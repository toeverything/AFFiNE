
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface FormatColorTextIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FormatColorTextIcon: FC<FormatColorTextIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 21H3v-1.6h18V21Z" clipRule="evenodd" /><path d="M11.12 3 5.5 17.28h1.76l1.52-4h6.56l1.52 4h1.78L13.02 3h-1.9ZM9.3 11.9l2.74-7.14h.08l2.7 7.14H9.3Z" />
        </SvgIcon>
    )
};
