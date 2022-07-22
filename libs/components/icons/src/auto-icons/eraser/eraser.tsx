
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface EraserIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const EraserIcon: FC<EraserIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M15.98 3.848a2.8 2.8 0 0 0-3.96 0L2.848 13.02a2.8 2.8 0 0 0 0 3.96l3 3a2.8 2.8 0 0 0 1.98.82H21v-1.6H12.93l7.22-7.22a2.8 2.8 0 0 0 0-3.96L15.98 3.848Zm.454 9.586L10.668 19.2h-2.84a1.2 1.2 0 0 1-.848-.352l-3-3a1.2 1.2 0 0 1 0-1.697l6.586-6.585 5.868 5.868Zm1.132-1.131-5.87-5.869 1.455-1.454a1.2 1.2 0 0 1 1.697 0L19.02 9.15a1.2 1.2 0 0 1 0 1.697l-1.454 1.455Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
