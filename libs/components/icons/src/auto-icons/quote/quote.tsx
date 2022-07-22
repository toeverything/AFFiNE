
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface QuoteIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const QuoteIcon: FC<QuoteIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path d="m3 7 1.455-4h1.251L4.72 7H3Zm3.294 0L7.74 3H9l-.987 4h-1.72ZM21 17l-1.509 4h-1.297l1.033-4H21Zm-3.203 0-1.5 4H15l1.023-4h1.774Z" /><path fillRule="evenodd" d="M21 7h-8V5.4h8V7ZM3 17h8v1.6H3V17ZM21 12.8H3v-1.6h18v1.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
