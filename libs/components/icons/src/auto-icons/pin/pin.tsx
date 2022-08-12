
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface PinIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const PinIcon = ({ color, style, ...props}: PinIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <g clipPath="url(#a)"><path fillRule="evenodd" d="M20.403 7.84a2 2 0 0 1 0 2.828l-2.12 2.12-1.414-1.414-2.596 2.595a6.003 6.003 0 0 1-1.172 6.83l-4.243-4.243-3.834 3.834a1 1 0 1 1-1.414-1.414l3.834-3.834L3.2 10.9a6.002 6.002 0 0 1 6.83-1.173l2.595-2.596-1.414-1.414 2.12-2.12a2 2 0 0 1 2.829 0l4.242 4.242Z" clipRule="evenodd" /></g><defs><clipPath id="a"><path d="M0 0H24V24H0z" transform="matrix(-1 0 0 1 24 0)" /></clipPath></defs>
        </SvgIcon>
    )
};
