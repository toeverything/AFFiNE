
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BringToFrontIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BringToFrontIcon = ({ color, style, ...props}: BringToFrontIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18.566 12.434 12 5.87l-6.566 6.565 1.132 1.132L11.2 8.93V21h1.6V8.931l4.634 4.635 1.132-1.132ZM5 3h14v1.6H5V3Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
