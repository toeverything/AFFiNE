
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface LinkIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const LinkIcon: FC<LinkIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m17.225 13.642 2.588-2.588a4.5 4.5 0 0 0 0-6.364l-.511-.511a4.5 4.5 0 0 0-6.364 0l-3.261 3.26a4.5 4.5 0 0 0 0 6.365l.51.51a4.5 4.5 0 0 0 1.055.785l.808-.808c.131-.131.229-.283.292-.446a2.89 2.89 0 0 1-1.023-.662l-.51-.51a2.9 2.9 0 0 1 0-4.102l3.26-3.26a2.9 2.9 0 0 1 4.101 0l.511.51a2.9 2.9 0 0 1 0 4.101l-1.704 1.705c.195.655.278 1.337.248 2.014Z" clipRule="evenodd" /><path fillRule="evenodd" d="m6.765 10.348-2.588 2.588a4.5 4.5 0 0 0 0 6.364l.511.511a4.5 4.5 0 0 0 6.364 0l3.261-3.26a4.5 4.5 0 0 0 0-6.365l-.51-.51a4.498 4.498 0 0 0-1.055-.785l-.808.808a1.295 1.295 0 0 0-.292.446c.373.14.723.361 1.023.662l.51.51a2.9 2.9 0 0 1 0 4.102l-3.26 3.26a2.9 2.9 0 0 1-4.101 0l-.511-.51a2.9 2.9 0 0 1 0-4.101l1.704-1.705a6.124 6.124 0 0 1-.248-2.014Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
