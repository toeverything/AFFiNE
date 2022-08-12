
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface FormatBackgroundIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FormatBackgroundIcon = ({ color, style, ...props}: FormatBackgroundIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Zm-.45 16 5.51-14h1.862l5.51 14h-1.745l-1.49-3.922H8.766L7.276 19H5.55Zm6.412-12.275-2.687 7h5.412l-2.647-7h-.078Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
