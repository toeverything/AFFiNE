
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface SolidLineIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SolidLineIcon = ({ color, style, ...props}: SolidLineIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M3 20 20 3l.99.99-17 17L3 20Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
