
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface InformationIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const InformationIcon: FC<InformationIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8Zm0 1.6c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" clipRule="evenodd" /><path fillRule="evenodd" d="M11.2 18v-7h1.6v7h-1.6Z" clipRule="evenodd" /><circle cx={12} cy={8} r={1.5} />
        </SvgIcon>
    )
};
