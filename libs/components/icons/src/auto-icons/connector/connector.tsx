
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ConnectorIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ConnectorIcon = ({ color, style, ...props}: ConnectorIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M15.6 6.5a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 0 0-3.8 0ZM17.5 3a3.5 3.5 0 0 0-2.924 5.424l-6.152 6.152a3.5 3.5 0 1 0 1.1 1.162l6.214-6.213A3.5 3.5 0 1 0 17.5 3ZM4.6 17.5a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 0 0-3.8 0Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
