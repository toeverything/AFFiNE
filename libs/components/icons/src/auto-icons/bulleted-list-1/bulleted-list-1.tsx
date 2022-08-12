
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BulletedList_1IconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BulletedList_1Icon = ({ color, style, ...props}: BulletedList_1IconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <circle cx={12} cy={12} r={2} />
        </SvgIcon>
    )
};
