
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface TableIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const TableIcon: FC<TableIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M6 4.6h12A1.4 1.4 0 0 1 19.4 6v2H4.6V6A1.4 1.4 0 0 1 6 4.6Zm3.6 5h9.8v4.2H9.6V9.6ZM8 13.8V9.6H4.6v4.2H8Zm-3.4 1.6H8v4H6A1.4 1.4 0 0 1 4.6 18v-2.6Zm5 0h9.8V18a1.4 1.4 0 0 1-1.4 1.4H9.6v-4ZM3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
