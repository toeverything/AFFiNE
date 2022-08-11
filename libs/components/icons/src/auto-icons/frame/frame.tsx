
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface FrameIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FrameIcon = ({ color, style, ...props}: FrameIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M8 3v3.4h8V3h1.6v3.4H21V8h-3.4v8H21v1.6h-3.4V21H16v-3.4H8V21H6.4v-3.4H3V16h3.4V8H3V6.4h3.4V3H8Zm8 13V8H8v8h8Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
