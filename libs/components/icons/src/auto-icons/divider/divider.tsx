
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface DividerIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DividerIcon: FC<DividerIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 12.8H3v-1.6h18v1.6ZM4 2V9.2h1.6V3.6h6.737l5.6 5.6H20V9l-7-7H4Zm14.4 12.8H20V22H7a3 3 0 0 1-3-3v-4.2h1.6V19A1.4 1.4 0 0 0 7 20.4h11.4v-5.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
