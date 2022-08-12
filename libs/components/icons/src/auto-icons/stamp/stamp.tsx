
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface StampIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const StampIcon = ({ color, style, ...props}: StampIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m12.9 11.408.799-.462a3.4 3.4 0 1 0-3.398 0l.799.462V16.6H6A1.4 1.4 0 0 0 4.6 18v1.4h14.8V18a1.4 1.4 0 0 0-1.4-1.4h-5.1v-5.192ZM21 21H3v-3a3 3 0 0 1 3-3h3.5v-2.669a5 5 0 1 1 5 0V15H18a3 3 0 0 1 3 3v3Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
