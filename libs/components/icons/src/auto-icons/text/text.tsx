
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface TextIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const TextIcon: FC<TextIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 3H3v2h8v16h2V5h8V3Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
