
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface CheckBoxCheckIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CheckBoxCheckIcon = ({ color, style, ...props}: CheckBoxCheckIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M7 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm10.567 5.565a.8.8 0 1 0-1.134-1.13l-6.078 6.098-2.788-2.798a.8.8 0 0 0-1.134 1.13l3.213 3.224a1 1 0 0 0 1.417 0l6.504-6.524Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
