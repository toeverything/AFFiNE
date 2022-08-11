
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface CodeIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CodeIcon = ({ color, style, ...props}: CodeIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m7.434 6.434 1.132 1.132L4.13 12l4.435 4.434-1.132 1.132L1.87 12l5.565-5.566ZM16.566 17.566l-1.132-1.132L19.87 12l-4.435-4.434 1.132-1.132L22.13 12l-5.565 5.566ZM9.333 16 13 8l1.454.667-3.666 8L9.333 16Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
