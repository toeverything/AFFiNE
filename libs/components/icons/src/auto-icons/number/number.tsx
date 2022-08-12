
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface NumberIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const NumberIcon = ({ color, style, ...props}: NumberIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 4.6H6A1.4 1.4 0 0 0 4.6 6v12A1.4 1.4 0 0 0 6 19.4h12a1.4 1.4 0 0 0 1.4-1.4V6A1.4 1.4 0 0 0 18 4.6ZM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Z" clipRule="evenodd" /><path fillRule="evenodd" d="M12.013 7.9H13.1v8.2h-1.454V9.803c-.443.374-.98.656-1.617.847l-.129.04V9.177l.075-.02c.331-.087.687-.239 1.066-.46.38-.242.693-.494.942-.766l.03-.032Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
