
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface PagesIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const PagesIcon: FC<PagesIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M4 5.2h-.8V19A2.8 2.8 0 0 0 6 21.8h11.8V11.169l-.234-.235-5.5-5.5-.235-.234H4ZM4.8 19V6.8h5.4v6h6v7.4H6A1.2 1.2 0 0 1 4.8 19Zm10.769-7.8L11.8 7.431V11.2h3.769Z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.2 2.2h8.631l.235.234 5.5 5.5.234.235V18.8H18v-1.6h1.2V9.8h-2.4l-1.6-1.6h3.369L14.8 4.431V7.8l-1.6-1.6V3.8H7.8V5H6.2V2.2Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
