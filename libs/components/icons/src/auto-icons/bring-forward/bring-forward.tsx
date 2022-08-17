
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BringForwardIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BringForwardIcon = ({ color, style, ...props}: BringForwardIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18.566 9.434 12 2.87 5.434 9.434l1.132 1.132L11.2 5.93V21h1.6V5.931l4.634 4.635 1.132-1.132Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
