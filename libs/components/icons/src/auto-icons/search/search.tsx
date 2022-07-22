
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SearchIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SearchIcon: FC<SearchIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M14.4 9.5a4.9 4.9 0 1 1-9.8 0 4.9 4.9 0 0 1 9.8 0Zm-.979 5.184a6.5 6.5 0 1 1 1.148-1.115L21 20l-1.131 1.131-6.447-6.447Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
