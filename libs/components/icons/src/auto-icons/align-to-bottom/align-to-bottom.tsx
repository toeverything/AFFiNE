
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface AlignToBottomIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AlignToBottomIcon = ({ color, style, ...props}: AlignToBottomIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 21H3v-1h18v1Z" clipRule="evenodd" /><path d="M7 17H15V20H7z" transform="rotate(-90 7 17)" /><path d="M14 17H28V20H14z" transform="rotate(-90 14 17)" />
        </SvgIcon>
    )
};
