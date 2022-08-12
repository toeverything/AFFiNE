
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface CalloutIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CalloutIcon = ({ color, style, ...props}: CalloutIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M20 21H8v-1.6h12V21ZM20 16.4H4v-1.6h16v1.6ZM19 4.6H5a.4.4 0 0 0-.4.4v5c0 .22.18.4.4.4h14a.4.4 0 0 0 .4-.4V5a.4.4 0 0 0-.4-.4ZM5 3a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
