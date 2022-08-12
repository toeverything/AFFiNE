
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface AddViewIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AddViewIcon = ({ color, style, ...props}: AddViewIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8Zm0 1.6c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" clipRule="evenodd" /><path fillRule="evenodd" d="M11 13v4h2v-4h4v-2h-4V7h-2v4H7v2h4Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
