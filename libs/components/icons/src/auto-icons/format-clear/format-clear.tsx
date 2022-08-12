
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface FormatClearIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FormatClearIcon = ({ color, style, ...props}: FormatClearIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M11.665 14.924 15.615 21H18l-5.41-8.323-1.324-2.037L6.3 3H3.915l6.426 9.887L7 21l1.85.762 2.815-6.838ZM15.75 5l-2.236 5.43-1.324-2.037L13.588 5H9.985l-1.3-2H21v2h-5.249Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
