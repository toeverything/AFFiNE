
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ForwardRedoIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ForwardRedoIcon: FC<ForwardRedoIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m12.879 5.707 1.414-1.414L22 12l-7.707 7.707-1.414-1.414L18.172 13H9c-2.074 0-3.274.842-3.988 1.834C4.26 15.878 4 17.16 4 18H2c0-1.16.34-2.878 1.388-4.334C4.474 12.158 6.275 11 9.001 11h9.17L12.88 5.707Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
