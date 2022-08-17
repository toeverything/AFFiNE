
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface AlignVerticalCenterIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AlignVerticalCenterIcon = ({ color, style, ...props}: AlignVerticalCenterIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 12.5H3v-1h18v1Z" clipRule="evenodd" /><path d="M7 16H15V19H7z" transform="rotate(-90 7 16)" /><path d="M14 19H28V22H14z" transform="rotate(-90 14 19)" />
        </SvgIcon>
    )
};
