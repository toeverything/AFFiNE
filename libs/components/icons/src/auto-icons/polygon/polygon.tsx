
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface PolygonIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const PolygonIcon: FC<PolygonIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m20.17 12-4.111-7.4H7.94L3.831 12l4.11 7.4h8.118l4.11-7.4ZM17 21l5-9-5-9H7l-5 9 5 9h10Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
