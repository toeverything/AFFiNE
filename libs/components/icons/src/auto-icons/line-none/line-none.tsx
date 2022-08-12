
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface LineNoneIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const LineNoneIcon = ({ color, style, ...props}: LineNoneIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18.6 12a6.6 6.6 0 0 1-10.69 5.18l9.27-9.27A6.572 6.572 0 0 1 18.6 12ZM6.91 16.201 16.2 6.91a6.6 6.6 0 0 0-9.292 9.292ZM20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
