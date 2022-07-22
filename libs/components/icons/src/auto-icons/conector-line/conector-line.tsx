
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ConectorLineIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ConectorLineIcon: FC<ConectorLineIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M3.434 20.434a.8.8 0 0 1 0-1.131L19.303 3.434a.8.8 0 1 1 1.131 1.132L4.566 20.434a.8.8 0 0 1-1.132 0Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
