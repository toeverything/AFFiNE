
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface DeleteSmallTagIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const DeleteSmallTagIcon = ({ color, style, ...props}: DeleteSmallTagIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M11.578 12.007 9 14.585l.425.425 2.578-2.578 2.582 2.582.425-.425-2.582-2.582 2.582-2.582L14.585 9l-2.582 2.582-2.578-2.578L9 9.43l2.578 2.577Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
