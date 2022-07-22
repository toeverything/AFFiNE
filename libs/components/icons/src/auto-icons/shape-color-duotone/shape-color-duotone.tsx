
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ShapeColorDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
}

export const ShapeColorDuotoneIcon: FC<ShapeColorDuotoneIconProps> = ({ color0, primaryColor, style, ...props}) => {
    const propsStyles = {"--color-0": color0 || primaryColor};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path style={{fill: 'var(--color-0)'}} fillRule="evenodd" d="M8.143 3A5.143 5.143 0 0 0 3 8.143v7.714A5.143 5.143 0 0 0 8.143 21h7.714A5.143 5.143 0 0 0 21 15.857V8.143A5.143 5.143 0 0 0 15.857 3H8.143Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
