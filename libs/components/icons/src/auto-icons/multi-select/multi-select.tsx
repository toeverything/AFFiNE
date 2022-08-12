
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface MultiSelectIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const MultiSelectIcon = ({ color, style, ...props}: MultiSelectIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M19 4.6H8a.4.4 0 0 0-.4.4v11c0 .22.18.4.4.4h11a.4.4 0 0 0 .4-.4V5a.4.4 0 0 0-.4-.4ZM8 3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8Z" clipRule="evenodd" /><path fillRule="evenodd" d="M4.6 8v11c0 .22.18.4.4.4h11V21H5a2 2 0 0 1-2-2V8h1.6Z" clipRule="evenodd" /><path d="M13.895 12.34a.568.568 0 0 1-.79 0l-2.993-3.149c-.265-.278-.03-.691.395-.691h5.986c.424 0 .66.413.395.691l-2.993 3.15Z" />
        </SvgIcon>
    )
};
