
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface KanBanIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const KanBanIcon: FC<KanBanIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 3.8a.8.8 0 0 1-.8.8h-6.4a.8.8 0 0 1 0-1.6h6.4a.8.8 0 0 1 .8.8ZM11 3.8a.8.8 0 0 1-.8.8H3.8a.8.8 0 0 1 0-1.6h6.4a.8.8 0 0 1 .8.8ZM9 8.6H5a.4.4 0 0 0-.4.4v10c0 .22.18.4.4.4h4a.4.4 0 0 0 .4-.4V9a.4.4 0 0 0-.4-.4ZM5 7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5ZM19 8.6h-4a.4.4 0 0 0-.4.4v5c0 .22.18.4.4.4h4a.4.4 0 0 0 .4-.4V9a.4.4 0 0 0-.4-.4ZM15 7a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
