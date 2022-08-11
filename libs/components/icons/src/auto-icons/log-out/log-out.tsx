
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface LogOutIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const LogOutIcon = ({ color, style, ...props}: LogOutIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m16.434 8.566 1.132-1.132L22.13 12l-4.565 4.566-1.132-1.132L19.07 12.8H12v-1.6h7.069l-2.635-2.634Z" clipRule="evenodd" /><path fillRule="evenodd" d="M17 3.6H7A1.4 1.4 0 0 0 5.6 5v14A1.4 1.4 0 0 0 7 20.4h10a1.4 1.4 0 0 0 1.4-1.4v-1H20v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v1h-1.6V5A1.4 1.4 0 0 0 17 3.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
