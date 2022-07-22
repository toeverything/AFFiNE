
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface DuplicateIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DuplicateIcon: FC<DuplicateIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 8.6h-8A1.4 1.4 0 0 0 8.6 10v8a1.4 1.4 0 0 0 1.4 1.4h8a1.4 1.4 0 0 0 1.4-1.4v-8A1.4 1.4 0 0 0 18 8.6ZM10 7a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3h-8Z" clipRule="evenodd" /><path fillRule="evenodd" d="M13.2 17v-6h1.6v6h-1.6Z" clipRule="evenodd" /><path fillRule="evenodd" d="M11 13.2h6v1.6h-6v-1.6ZM6 4.6h8A1.4 1.4 0 0 1 15.4 6v1H17V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h1v-1.6H6A1.4 1.4 0 0 1 4.6 14V6A1.4 1.4 0 0 1 6 4.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
