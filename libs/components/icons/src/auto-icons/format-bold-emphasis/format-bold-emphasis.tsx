
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface FormatBoldEmphasisIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FormatBoldEmphasisIcon = ({ color, style, ...props}: FormatBoldEmphasisIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M7.2 5.2h5.3a2.3 2.3 0 1 1 0 4.6H7.2V5.2ZM5 10V3h7.5a4.5 4.5 0 0 1 3.578 7.23A5.5 5.5 0 0 1 14.5 21H5V10Zm2.2 2.2h7.3a3.3 3.3 0 0 1 0 6.6H7.2v-6.6Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
