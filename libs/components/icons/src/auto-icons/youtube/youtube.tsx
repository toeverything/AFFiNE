
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface YoutubeIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const YoutubeIcon = ({ color, style, ...props}: YoutubeIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fill="red" d="M20.6 7.528a2.339 2.339 0 0 0-.583-1.037 2.25 2.25 0 0 0-1.009-.6C17.612 5.5 11.991 5.5 11.991 5.5s-5.621.012-7.018.403a2.25 2.25 0 0 0-1.008.6A2.34 2.34 0 0 0 3.38 7.54c-.423 2.549-.587 6.433.011 8.88.103.393.305.75.584 1.037.28.287.627.494 1.009.6 1.396.391 7.017.391 7.017.391s5.621 0 7.018-.39a2.25 2.25 0 0 0 1.008-.601c.28-.287.481-.644.584-1.036.446-2.553.583-6.435-.011-8.893Z" /><path fill="#fff" d="m10.202 14.749 4.663-2.775L10.202 9.2v5.549Z" />
        </SvgIcon>
    )
};
