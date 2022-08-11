
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface TagAddDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
    color1?: string
    secondaryColor?: string
}

export const TagAddDuotoneIcon = ({ color0, primaryColor, color1, secondaryColor, style, ...props}: TagAddDuotoneIconProps) => {
    const propsStyles = {"--color-0": color0 || primaryColor, "--color-1": color1 || secondaryColor};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <circle cx={12} cy={12} r={10} style={{fill: 'var(--color-0)'}} /><path style={{fill: 'var(--color-1)'}} fillRule="evenodd" d="M11.2 12.8V16h1.6v-3.2H16v-1.6h-3.2V8h-1.6v3.2H8v1.6h3.2Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
