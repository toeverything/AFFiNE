
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ShapesAlignLeftIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ShapesAlignLeftIcon = ({ color, style, ...props}: ShapesAlignLeftIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M3 21V3h1v18H3Z" clipRule="evenodd" /><path d="M7 7H15V10H7z" /><path d="M7 14H21V17H7z" />
        </SvgIcon>
    )
};
