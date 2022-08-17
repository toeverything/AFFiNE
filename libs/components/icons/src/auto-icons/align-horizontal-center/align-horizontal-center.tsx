
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface AlignHorizontalCenterIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AlignHorizontalCenterIcon = ({ color, style, ...props}: AlignHorizontalCenterIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M11.5 21V3h1v18h-1Z" clipRule="evenodd" /><path d="M8 7H16V10H8z" /><path d="M5 14H19V17H5z" />
        </SvgIcon>
    )
};
