
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface DistributeHorizontalIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DistributeHorizontalIcon = ({ color, style, ...props}: DistributeHorizontalIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M20 21V3h-1v18h1ZM5 21V3H4v18h1Z" clipRule="evenodd" /><path d="M0 0H10V3H0z" transform="matrix(0 -1 -1 0 13.5 17)" />
        </SvgIcon>
    )
};
