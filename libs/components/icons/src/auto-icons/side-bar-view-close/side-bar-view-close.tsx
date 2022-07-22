
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SideBarViewCloseIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SideBarViewCloseIcon: FC<SideBarViewCloseIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 5.6H6A1.4 1.4 0 0 0 4.6 7v10A1.4 1.4 0 0 0 6 18.4h12a1.4 1.4 0 0 0 1.4-1.4V7A1.4 1.4 0 0 0 18 5.6ZM6 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H6Z" clipRule="evenodd" /><path fillRule="evenodd" d="M14 19V5h1.6v14H14ZM9.369 12 6.934 9.566l1.132-1.132L11.63 12l-3.565 3.566-1.132-1.132L9.37 12Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
