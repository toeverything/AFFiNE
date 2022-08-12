
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BackwardUndoIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BackwardUndoIcon = ({ color, style, ...props}: BackwardUndoIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M11.121 5.707 9.707 4.293 2 12l7.707 7.707 1.414-1.414L5.828 13H15c2.074 0 3.274.842 3.988 1.834C19.74 15.878 20 17.16 20 18h2c0-1.16-.34-2.878-1.389-4.334C19.526 12.158 17.726 11 15 11H5.83l5.292-5.293Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
