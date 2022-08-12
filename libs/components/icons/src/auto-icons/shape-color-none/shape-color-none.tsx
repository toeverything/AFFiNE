
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ShapeColorNoneIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ShapeColorNoneIcon = ({ color, style, ...props}: ShapeColorNoneIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M3.06 8.143C3.02 8.423 3 8.709 3 9v1.714h2.571v2.572H3V15c0 .291.02.577.06.857h2.511v2.572H4.075c.407.582.914 1.09 1.496 1.496v-1.496h2.572v2.51c.28.04.566.061.857.061h1.714v-2.571h2.572V21H15c.291 0 .577-.02.857-.06v-2.511h2.572v1.496a6.038 6.038 0 0 0 1.496-1.496h-1.496v-2.572h2.51c.04-.28.061-.566.061-.857v-1.714h-2.571v-2.572H21V9c0-.291-.02-.577-.06-.857h-2.511V5.57h1.496a6.036 6.036 0 0 0-1.496-1.496v1.496h-2.572v-2.51A6.05 6.05 0 0 0 15 3h-1.714v2.571h-2.572V3H9c-.291 0-.577.02-.857.06v2.511H5.57V4.075a6.034 6.034 0 0 0-1.496 1.496h1.496v2.572h-2.51Zm5.083 0V5.57h2.571v2.572H8.143Zm0 2.571H5.57V8.143h2.572v2.571Zm2.571 0V8.143h2.572v2.571h-2.572Zm0 2.572v-2.572H8.143v2.572H5.57v2.571h2.572v2.572h2.571v-2.572h2.572v2.572h2.571v-2.572h2.572v-2.571h-2.572v-2.572h2.572V8.143h-2.572V5.57h-2.571v2.572h2.571v2.571h-2.571v2.572h-2.572Zm0 0v2.571H8.143v-2.571h2.571Zm2.572 0h2.571v2.571h-2.571v-2.571Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
