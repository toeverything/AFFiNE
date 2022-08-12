
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BulletIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BulletIcon = ({ color, style, ...props}: BulletIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 4.6H6A1.4 1.4 0 0 0 4.6 6v12A1.4 1.4 0 0 0 6 19.4h12a1.4 1.4 0 0 0 1.4-1.4V6A1.4 1.4 0 0 0 18 4.6ZM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Z" clipRule="evenodd" /><circle cx={12} cy={12} r={2} />
        </SvgIcon>
    )
};
