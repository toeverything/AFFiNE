
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface DocViewIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DocViewIcon: FC<DocViewIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M19 6.6H5a.4.4 0 0 0-.4.4v10c0 .22.18.4.4.4h14a.4.4 0 0 0 .4-.4V7a.4.4 0 0 0-.4-.4ZM5 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5Z" clipRule="evenodd" /><path fillRule="evenodd" d="M17 9.8H7V8.2h10v1.6Zm-5 3H7v-1.6h5v1.6Zm-5 3h7v-1.6H7v1.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
