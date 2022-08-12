
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface AlignRightIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AlignRightIcon = ({ color, style, ...props}: AlignRightIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M2 4h20v1.6H2V4ZM8 9h14v1.6H8V9ZM22 15H2v-1.6h20V15ZM22 20H8v-1.6h14V20Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
