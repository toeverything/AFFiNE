
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface Rectangle_93IconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const Rectangle_93Icon = ({ color, style, ...props}: Rectangle_93IconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path strokeWidth={2} d="M1 1H1676V1086H1z" />
        </SvgIcon>
    )
};
