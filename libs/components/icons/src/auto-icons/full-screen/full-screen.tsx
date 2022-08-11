
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface FullScreenIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FullScreenIcon = ({ color, style, ...props}: FullScreenIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18.069 4.8H14V3.2h6.8V10h-1.6V5.931l-4.634 4.635-1.132-1.132L18.07 4.8ZM5.931 19.2l4.635-4.634-1.132-1.132L4.8 18.07V14H3.2v6.8H10v-1.6H5.931Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
