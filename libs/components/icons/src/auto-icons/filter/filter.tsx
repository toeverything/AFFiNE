
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface FilterIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FilterIcon: FC<FilterIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M10.6 10.82v7.817l2.8-2.8v-5.016L18.584 4.6H5.416l5.184 6.22ZM15 16.5 10.5 21H9v-9.6L3.367 4.64A1 1 0 0 1 4.135 3h15.73a1 1 0 0 1 .768 1.64L15 11.4v5.1Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
