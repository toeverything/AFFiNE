
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BorderColorDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
}

export const BorderColorDuotoneIcon = ({ color0, primaryColor, style, ...props}: BorderColorDuotoneIconProps) => {
    const propsStyles = {"--color-0": color0 || primaryColor};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path style={{fill: 'var(--color-0)'}} fillRule="evenodd" d="M15.857 5.571H8.143A2.571 2.571 0 0 0 5.57 8.143v7.714a2.571 2.571 0 0 0 2.572 2.572h7.714a2.572 2.572 0 0 0 2.572-2.572V8.143a2.571 2.571 0 0 0-2.572-2.572ZM8.143 3A5.143 5.143 0 0 0 3 8.143v7.714A5.143 5.143 0 0 0 8.143 21h7.714A5.143 5.143 0 0 0 21 15.857V8.143A5.143 5.143 0 0 0 15.857 3H8.143Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
