
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BulletedList_2IconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BulletedList_2Icon = ({ color, style, ...props}: BulletedList_2IconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 .5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
