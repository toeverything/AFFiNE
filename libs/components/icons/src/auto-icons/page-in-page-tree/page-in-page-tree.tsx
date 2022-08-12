
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface PageInPageTreeIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const PageInPageTreeIcon = ({ color, style, ...props}: PageInPageTreeIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <circle cx={12} cy={12} r={2.5} />
        </SvgIcon>
    )
};
