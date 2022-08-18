
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface AlignIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AlignIcon = ({ color, style, ...props}: AlignIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18.4 5.6H5.6v12.8h12.8V5.6ZM4 4v16h16V4H4Z" clipRule="evenodd" /><path d="M3 3H5V5H3z" /><path d="M3 19H5V21H3z" /><path d="M3 11H5V13H3z" /><path d="M11 3H13V5H11z" /><path d="M11 19H13V21H11z" /><path d="M11 11H13V13H11z" /><path d="M19 3H21V5H19z" /><path d="M19 19H21V21H19z" /><path d="M19 11H21V13H19z" />
        </SvgIcon>
    )
};
