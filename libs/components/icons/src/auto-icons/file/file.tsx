
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface FileIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FileIcon = ({ color, style, ...props}: FileIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m14.337 8.6-3-3H4a.4.4 0 0 0-.4.4v12c0 .22.18.4.4.4h16a.4.4 0 0 0 .4-.4V9a.4.4 0 0 0-.4-.4h-5.663ZM12 4l3 3h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8Z" clipRule="evenodd" /><path fillRule="evenodd" d="M21 12H3v-1.6h18V12Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
