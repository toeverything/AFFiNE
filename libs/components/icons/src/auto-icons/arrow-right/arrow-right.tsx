
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ArrowRightIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ArrowRightIcon = ({ color, style, ...props}: ArrowRightIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m14 12-4-4v8l4-4Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
