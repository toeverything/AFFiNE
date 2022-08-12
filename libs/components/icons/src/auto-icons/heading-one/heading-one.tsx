
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface HeadingOneIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const HeadingOneIcon = ({ color, style, ...props}: HeadingOneIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M2 20V4h1.6v16H2ZM14 4v16h-1.6V4H14Z" clipRule="evenodd" /><path fillRule="evenodd" d="M12.5 12.8h-9v-1.6h9v1.6Z" clipRule="evenodd" /><path d="M20.68 9.29c-.36.375-.81.72-1.35 1.05-.54.3-1.05.51-1.53.63v1.74c.99-.285 1.8-.72 2.445-1.305V20H22V9.29h-1.32Z" />
        </SvgIcon>
    )
};
