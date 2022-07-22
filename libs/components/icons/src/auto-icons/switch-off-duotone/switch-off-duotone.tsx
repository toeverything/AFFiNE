
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SwitchOffDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
    color1?: string
    secondaryColor?: string
    color2?: string
}

export const SwitchOffDuotoneIcon: FC<SwitchOffDuotoneIconProps> = ({ color0, primaryColor, color1, secondaryColor, color2, style, ...props}) => {
    const propsStyles = {"--color-0": color0 || primaryColor, "--color-1": color1 || secondaryColor, "--color-2": color2};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path style={{fill: 'var(--color-0)'}} d="M1 9a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V9Z" /><path style={{fill: 'var(--color-1)'}} fillRule="evenodd" d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2ZM4 6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3H4Z" clipRule="evenodd" /><rect width={8} height={8} x={3} y={8} style={{fill: 'var(--color-2)'}} rx={2} />
        </SvgIcon>
    )
};
