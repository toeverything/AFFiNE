
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ShapesAlignTopIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ShapesAlignTopIcon = ({ color, style, ...props}: ShapesAlignTopIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 3H3v1h18V3Z" clipRule="evenodd" /><path d="M0 0H8V3H0z" transform="matrix(0 1 1 0 7 7)" /><path d="M0 0H14V3H0z" transform="matrix(0 1 1 0 14 7)" />
        </SvgIcon>
    )
};
