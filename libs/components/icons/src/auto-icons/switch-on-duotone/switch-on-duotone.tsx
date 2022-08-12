
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface SwitchOnDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
    color1?: string
    secondaryColor?: string
}

export const SwitchOnDuotoneIcon = ({ color0, primaryColor, color1, secondaryColor, style, ...props}: SwitchOnDuotoneIconProps) => {
    const propsStyles = {"--color-0": color0 || primaryColor, "--color-1": color1 || secondaryColor};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <rect width={22} height={12} x={1} y={6} style={{fill: 'var(--color-0)'}} rx={3} /><rect width={8} height={8} x={13} y={8} style={{fill: 'var(--color-1)'}} rx={2} />
        </SvgIcon>
    )
};
