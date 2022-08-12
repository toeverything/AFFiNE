
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ArrowDropDownIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ArrowDropDownIcon = ({ color, style, ...props}: ArrowDropDownIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m12 14 4-4H8l4 4Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
