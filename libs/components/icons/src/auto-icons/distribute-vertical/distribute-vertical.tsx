
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface DistributeVerticalIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DistributeVerticalIcon = ({ color, style, ...props}: DistributeVerticalIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M20.75 4.25h-18v1h18v-1ZM20.75 18.75h-18v1h18v-1Z" clipRule="evenodd" /><path d="M0 0H10V3H0z" transform="matrix(-1 0 0 1 17 10.5)" />
        </SvgIcon>
    )
};
