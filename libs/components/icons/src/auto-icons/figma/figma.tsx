
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface FigmaIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FigmaIcon: FC<FigmaIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fill="#0ACF83" d="M9.25 21c1.518 0 2.75-1.344 2.75-3v-3H9.25c-1.518 0-2.75 1.344-2.75 3s1.232 3 2.75 3Z" /><path fill="#A259FF" d="M6.5 12c0-1.656 1.232-3 2.75-3H12v6H9.25c-1.518 0-2.75-1.344-2.75-3Z" /><path fill="#F24E1E" d="M6.5 6c0-1.656 1.232-3 2.75-3H12v6H9.25C7.732 9 6.5 7.656 6.5 6Z" /><path fill="#FF7262" d="M12 3h2.75c1.518 0 2.75 1.344 2.75 3s-1.232 3-2.75 3H12V3Z" /><path fill="#1ABCFE" d="M17.5 12c0 1.656-1.232 3-2.75 3S12 13.656 12 12s1.232-3 2.75-3 2.75 1.344 2.75 3Z" />
        </SvgIcon>
    )
};
