
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface CardIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CardIcon = ({ color, style, ...props}: CardIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M19 5.6H5A1.4 1.4 0 0 0 3.6 7v10A1.4 1.4 0 0 0 5 18.4h14a1.4 1.4 0 0 0 1.4-1.4V7A1.4 1.4 0 0 0 19 5.6ZM5 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H5Z" clipRule="evenodd" /><path fillRule="evenodd" d="M6 8h12v1.6H6V8ZM6 11.5h12v1.6H6v-1.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
