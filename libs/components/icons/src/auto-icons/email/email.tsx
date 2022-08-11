
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface EmailIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const EmailIcon = ({ color, style, ...props}: EmailIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M5 5.6h14c.062 0 .124.004.184.012L12 11 4.816 5.612c.06-.008.122-.012.184-.012Zm-1.108.544a1.377 1.377 0 0 0-.025.034l.025-.034Zm-.264.577c-.018.09-.028.183-.028.279v10A1.4 1.4 0 0 0 5 18.4h14a1.4 1.4 0 0 0 1.4-1.4V7c0-.096-.01-.189-.028-.279L12 13.001 3.628 6.72Zm16.504-.545a1.339 1.339 0 0 0-.023-.03l.023.03ZM2 7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
