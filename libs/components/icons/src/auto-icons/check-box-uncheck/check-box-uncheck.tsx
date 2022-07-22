
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface CheckBoxUncheckIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CheckBoxUncheckIcon: FC<CheckBoxUncheckIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M17 5.6H7A1.4 1.4 0 0 0 5.6 7v10A1.4 1.4 0 0 0 7 18.4h10a1.4 1.4 0 0 0 1.4-1.4V7A1.4 1.4 0 0 0 17 5.6ZM7 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
