
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface CommentIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CommentIcon: FC<CommentIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m12.663 16.4 1.737 1.737V16.4H18a1.4 1.4 0 0 0 1.4-1.4V6A1.4 1.4 0 0 0 18 4.6H6A1.4 1.4 0 0 0 4.6 6v9A1.4 1.4 0 0 0 6 16.4h6.663ZM16 20.552a.6.6 0 0 1-1.024.424L12 18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-2v2.552Z" clipRule="evenodd" /><circle cx={8} cy={10.5} r={1} /><circle cx={12} cy={10.5} r={1} /><circle cx={16} cy={10.5} r={1} />
        </SvgIcon>
    )
};
