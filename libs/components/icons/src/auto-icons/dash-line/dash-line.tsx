
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface DashLineIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DashLineIcon = ({ color, style, ...props}: DashLineIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M17.167 5.833 20 3l.99.99-2.833 2.833-.99-.99ZM12.444 10.556l2.834-2.834.99.99-2.834 2.834-.99-.99ZM7.722 15.278l2.834-2.834.99.99-2.834 2.834-.99-.99ZM3 20l2.833-2.833.99.99L3.99 20.99 3 20Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
