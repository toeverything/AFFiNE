
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ArrowBigIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ArrowBigIcon: FC<ArrowBigIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M15.869 12 7.434 3.566l1.132-1.132L18.13 12l-9.565 9.566-1.132-1.132L15.87 12Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
