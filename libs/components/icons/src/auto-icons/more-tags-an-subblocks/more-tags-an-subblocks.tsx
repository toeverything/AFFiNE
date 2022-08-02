
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface MoreTagsAnSubblocksIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const MoreTagsAnSubblocksIcon: FC<MoreTagsAnSubblocksIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M2.2 3v13A3.8 3.8 0 0 0 6 19.8h10.316A2.801 2.801 0 0 0 21.8 19a2.8 2.8 0 0 0-5.484-.8H6A2.2 2.2 0 0 1 3.8 16v-6h12.584a2.801 2.801 0 1 0-.12-1.6H3.8V3H2.2ZM19 7.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM17.8 19a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 0 1-2.4 0Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
