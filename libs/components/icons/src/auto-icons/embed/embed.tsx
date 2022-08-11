
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface EmbedIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const EmbedIcon = ({ color, style, ...props}: EmbedIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M5.959 12.179C4.312 13.825 4.33 16.513 6 18.182c1.67 1.67 4.357 1.688 6.003.041l5.395-5.394 1.151 1.151-5.394 5.395c-2.274 2.273-5.986 2.248-8.29-.057-2.306-2.305-2.331-6.017-.057-8.29l6.92-6.92c1.588-1.588 4.18-1.57 5.789.039 1.61 1.61 1.627 4.201.04 5.789L10.99 16.5c-.902.902-2.373.892-3.288-.022-.914-.914-.924-2.386-.022-3.288l6.033-6.033 1.152 1.151-6.034 6.034a.708.708 0 0 0 .007 1 .708.708 0 0 0 1 .007l6.566-6.566c.96-.96.95-2.528-.024-3.502-.973-.973-2.541-.984-3.502-.023l-6.92 6.92Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
