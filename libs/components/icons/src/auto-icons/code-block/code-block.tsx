
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface CodeBlockIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CodeBlockIcon = ({ color, style, ...props}: CodeBlockIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M19 5.6H5A1.4 1.4 0 0 0 3.6 7v10A1.4 1.4 0 0 0 5 18.4h14a1.4 1.4 0 0 0 1.4-1.4V7A1.4 1.4 0 0 0 19 5.6ZM5 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H5Z" clipRule="evenodd" /><path fillRule="evenodd" d="m8.576 8.576.848.848L6.85 12l2.575 2.576-.848.848L5.15 12l3.425-3.424ZM15.424 15.424l-.848-.848L17.15 12l-2.575-2.576.848-.848L18.85 12l-3.425 3.424ZM10 15l3-6 1.073.537-3 6L10 15Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
