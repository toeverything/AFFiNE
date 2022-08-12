
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface MoveToIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const MoveToIcon = ({ color, style, ...props}: MoveToIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M10.069 11.2 7.434 8.566l1.132-1.132L13.13 12l-4.565 4.566-1.132-1.132L10.07 12.8H2v-1.6h8.069Z" clipRule="evenodd" /><path fillRule="evenodd" d="M7 4.6h12A1.4 1.4 0 0 1 20.4 6v12a1.4 1.4 0 0 1-1.4 1.4H7A1.4 1.4 0 0 1 5.6 18v-3H4v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v3h1.6V6A1.4 1.4 0 0 1 7 4.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
