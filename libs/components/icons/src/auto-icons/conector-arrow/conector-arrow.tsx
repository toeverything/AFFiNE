
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ConectorArrowIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ConectorArrowIcon: FC<ConectorArrowIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M20.8 9V4.1a.9.9 0 0 0-.9-.9H15v1.6h3.2L4.8 18.2V15H3.2v4.9a.9.9 0 0 0 .9.9H9v-1.6H6.063L19.2 6.063V9h1.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
