
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface TriangleIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const TriangleIcon = ({ color, style, ...props}: TriangleIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 3 3 21h18L12 3Zm0 3.578L5.589 19.4H18.41L12 6.578Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
