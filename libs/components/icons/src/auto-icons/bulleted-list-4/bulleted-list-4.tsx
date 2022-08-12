
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BulletedList_4IconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BulletedList_4Icon = ({ color, style, ...props}: BulletedList_4IconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M13.442 12 12 10.558 10.558 12 12 13.442 13.442 12Zm-1.048-1.837a.558.558 0 0 0-.788 0l-1.443 1.443a.558.558 0 0 0 0 .788l1.443 1.443a.558.558 0 0 0 .788 0l1.443-1.443a.558.558 0 0 0 0-.788l-1.443-1.443Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
