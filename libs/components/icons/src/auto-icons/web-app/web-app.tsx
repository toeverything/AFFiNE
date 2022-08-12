
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface WebAppIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const WebAppIcon = ({ color, style, ...props}: WebAppIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M20.052 14.4c.227-.76.348-1.566.348-2.4 0-.834-.121-1.64-.348-2.4h-3.47c.144.74.218 1.496.218 2.259v.282c0 .763-.074 1.52-.218 2.259h3.47Zm-5.105 0H9.053a10.199 10.199 0 0 1-.253-2.259v-.282c0-.765.086-1.523.253-2.259h5.894c.167.736.253 1.494.253 2.259v.282a10.2 10.2 0 0 1-.253 2.259ZM16.15 8h3.237a8.412 8.412 0 0 0-5.757-4.242l.583.73c.848 1.059 1.5 2.248 1.937 3.512ZM12 4.28l.965 1.207c.614.768 1.11 1.615 1.477 2.513H9.558c.367-.898.863-1.745 1.477-2.513L12 4.28ZM14.442 16a10.196 10.196 0 0 1-1.477 2.513L12 19.72l-.965-1.206A10.198 10.198 0 0 1 9.558 16h4.884Zm-.81 4.242.582-.73c.848-1.059 1.5-2.248 1.937-3.512h3.237a8.411 8.411 0 0 1-5.757 4.242ZM7.2 11.859c0-.763.074-1.52.218-2.259h-3.47A8.401 8.401 0 0 0 3.6 12c0 .834.122 1.64.348 2.4h3.47a11.798 11.798 0 0 1-.218-2.259v-.282Zm2.586-7.372.583-.729A8.412 8.412 0 0 0 4.612 8h3.237a11.799 11.799 0 0 1 1.937-3.513ZM4.612 16h3.237a11.8 11.8 0 0 0 1.937 3.513l.583.729A8.412 8.412 0 0 1 4.612 16ZM12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
