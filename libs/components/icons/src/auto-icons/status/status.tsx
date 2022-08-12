
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface StatusIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const StatusIcon = ({ color, style, ...props}: StatusIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m15.667 7.903 4.786-4.487 1.094 1.168-5.88 5.513-3.214-3.013 1.094-1.168 2.12 1.987ZM3 7h8v1.6H3V7ZM11 17.8H3v-1.6h8v1.6ZM17.066 18.048l2.823 2.823 1.113-1.114-2.823-2.823 2.823-2.823-1.113-1.113-2.823 2.823-2.953-2.952L13 13.982l2.952 2.952L13 19.887 14.113 21l2.953-2.952Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
