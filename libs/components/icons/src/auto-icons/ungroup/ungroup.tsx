
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface UngroupIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const UngroupIcon = ({ color, style, ...props}: UngroupIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <rect width={10} height={4} x={7} y={7} rx={1} /><rect width={10} height={4} x={12} y={15} rx={1} /><path fillRule="evenodd" d="M6 4.6h12A1.4 1.4 0 0 1 19.4 6v6H21V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h3v-1.6H6A1.4 1.4 0 0 1 4.6 18V6A1.4 1.4 0 0 1 6 4.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
