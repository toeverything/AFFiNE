
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface AddIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AddIcon = ({ color, style, ...props}: AddIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M11.04 12.96V18h1.92v-5.04H18v-1.92h-5.04V6h-1.92v5.04H6v1.92h5.04Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
