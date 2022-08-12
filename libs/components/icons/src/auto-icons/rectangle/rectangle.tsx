
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface RectangleIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const RectangleIcon = ({ color, style, ...props}: RectangleIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M19.4 4.6H4.6v14.8h14.8V4.6ZM3 3v18h18V3H3Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
