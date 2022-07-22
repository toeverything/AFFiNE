
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface EditIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const EditIcon: FC<EditIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m6.398 15.864-.383 1.151.97.97 1.15-.383 8.234-8.233L14.63 7.63l-8.233 8.233ZM15.763 6.5 17.5 8.237l1.369-1.368A1.228 1.228 0 0 0 17.13 5.13L15.763 6.5ZM16 4 5.133 14.867a.8.8 0 0 0-.193.312l-1.434 4.303a.8.8 0 0 0 1.012 1.012L8.82 19.06a.8.8 0 0 0 .312-.194L20 8a2.828 2.828 0 1 0-4-4Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
