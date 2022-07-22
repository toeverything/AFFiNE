
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SelectBoxSelectIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SelectBoxSelectIcon: FC<SelectBoxSelectIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 4.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4ZM3.2 12a8.8 8.8 0 1 1 17.6 0 8.8 8.8 0 0 1-17.6 0Z" clipRule="evenodd" /><circle cx={12} cy={12} r={4} />
        </SvgIcon>
    )
};
