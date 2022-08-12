
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface LaserPenDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
    color1?: string
    secondaryColor?: string
}

export const LaserPenDuotoneIcon = ({ color0, primaryColor, color1, secondaryColor, style, ...props}: LaserPenDuotoneIconProps) => {
    const propsStyles = {"--color-0": color0 || primaryColor, "--color-1": color1 || secondaryColor};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path style={{fill: 'var(--color-0)'}} fillRule="evenodd" d="m7.654 15.486.203-.61 9.892-9.892a.895.895 0 1 1 1.267 1.267l-9.893 9.892-.609.203-.86-.86Zm-1.158-1.683L16.532 3.767a2.618 2.618 0 0 1 3.701 3.701L10.197 17.504a.86.86 0 0 1-.336.208l-3.726 1.242a.861.861 0 0 1-1.09-1.089l1.243-3.726a.861.861 0 0 1 .208-.336Z" clipRule="evenodd" /><circle cx={3.5} cy={20.5} r={1.5} style={{fill: 'var(--color-1)'}} />
        </SvgIcon>
    )
};
