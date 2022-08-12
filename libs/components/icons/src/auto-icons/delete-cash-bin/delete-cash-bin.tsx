
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface DeleteCashBinIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DeleteCashBinIcon = ({ color, style, ...props}: DeleteCashBinIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M22 7H2V5.4h20V7ZM8 2h8v1.6H8V2ZM5.6 7v12A1.4 1.4 0 0 0 7 20.4h10a1.4 1.4 0 0 0 1.4-1.4V7H20v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7h1.6Z" clipRule="evenodd" /><path fillRule="evenodd" d="M9 18V9h1.6v9H9ZM15 9v9h-1.6V9H15Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
