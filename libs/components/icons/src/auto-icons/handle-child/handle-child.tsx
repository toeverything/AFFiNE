
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface HandleChildIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const HandleChildIcon = ({ color, style, ...props}: HandleChildIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <circle cx={14.482} cy={12} r={1.296} /><circle cx={14.482} cy={7.463} r={1.296} /><circle cx={14.482} cy={16.537} r={1.296} />
        </SvgIcon>
    )
};
