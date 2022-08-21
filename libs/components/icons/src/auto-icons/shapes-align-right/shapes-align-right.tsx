
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ShapesAlignRightIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ShapesAlignRightIcon = ({ color, style, ...props}: ShapesAlignRightIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 21V3h-1v18h1Z" clipRule="evenodd" /><path d="M0 0H8V3H0z" transform="matrix(-1 0 0 1 17 7)" /><path d="M0 0H14V3H0z" transform="matrix(-1 0 0 1 17 14)" />
        </SvgIcon>
    )
};
