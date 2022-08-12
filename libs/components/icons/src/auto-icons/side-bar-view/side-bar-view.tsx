
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface SideBarViewIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SideBarViewIcon = ({ color, style, ...props}: SideBarViewIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 5.6H6A1.4 1.4 0 0 0 4.6 7v10A1.4 1.4 0 0 0 6 18.4h12a1.4 1.4 0 0 0 1.4-1.4V7A1.4 1.4 0 0 0 18 5.6ZM6 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H6Z" clipRule="evenodd" /><path fillRule="evenodd" d="M14 19V5h1.6v14H14Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
