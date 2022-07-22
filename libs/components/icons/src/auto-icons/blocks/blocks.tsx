
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface BlocksIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BlocksIcon: FC<BlocksIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M9.2 4.6H5a.4.4 0 0 0-.4.4v4.2c0 .22.18.4.4.4h4.2a.4.4 0 0 0 .4-.4V5a.4.4 0 0 0-.4-.4ZM5 3a2 2 0 0 0-2 2v4.2a2 2 0 0 0 2 2h4.2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5ZM19 4.6h-4.2a.4.4 0 0 0-.4.4v4.2c0 .22.18.4.4.4H19a.4.4 0 0 0 .4-.4V5a.4.4 0 0 0-.4-.4ZM14.8 3a2 2 0 0 0-2 2v4.2a2 2 0 0 0 2 2H19a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4.2ZM9.2 14.4H5a.4.4 0 0 0-.4.4V19c0 .221.18.4.4.4h4.2a.4.4 0 0 0 .4-.4v-4.2a.4.4 0 0 0-.4-.4ZM5 12.8a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h4.2a2 2 0 0 0 2-2v-4.2a2 2 0 0 0-2-2H5ZM19 14.4h-4.2a.4.4 0 0 0-.4.4V19c0 .221.18.4.4.4H19a.4.4 0 0 0 .4-.4v-4.2a.4.4 0 0 0-.4-.4Zm-4.2-1.6a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2H19a2 2 0 0 0 2-2v-4.2a2 2 0 0 0-2-2h-4.2Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
