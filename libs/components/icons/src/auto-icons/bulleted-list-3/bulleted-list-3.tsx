
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BulletedList_3IconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BulletedList_3Icon = ({ color, style, ...props}: BulletedList_3IconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path d="M11.606 10.163a.558.558 0 0 1 .788 0l1.443 1.443a.558.558 0 0 1 0 .788l-1.443 1.443a.558.558 0 0 1-.788 0l-1.443-1.443a.558.558 0 0 1 0-.788l1.443-1.443Z" />
        </SvgIcon>
    )
};
