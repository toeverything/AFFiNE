
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface SendToBackIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SendToBackIcon = ({ color, style, ...props}: SendToBackIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12.8 15.069V3h-1.6v12.069l-4.634-4.635-1.132 1.132L12 18.13l6.566-6.565-1.132-1.132L12.8 15.07ZM19 21H5v-1.6h14V21Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
