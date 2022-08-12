
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface GroupIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const GroupIcon = ({ color, style, ...props}: GroupIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 4.6H6A1.4 1.4 0 0 0 4.6 6v12A1.4 1.4 0 0 0 6 19.4h12a1.4 1.4 0 0 0 1.4-1.4V6A1.4 1.4 0 0 0 18 4.6ZM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Z" clipRule="evenodd" /><rect width={10} height={4} x={7} y={7} rx={1} /><rect width={10} height={4} x={7} y={13} rx={1} />
        </SvgIcon>
    )
};
