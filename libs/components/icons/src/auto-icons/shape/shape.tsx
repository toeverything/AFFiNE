
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ShapeIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ShapeIcon: FC<ShapeIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M19.228 6.944 11.822 4.96l-1.984 7.406 1.613.432-.73 1.461-2.843-.762L10.69 3l10.497 2.813-2.813 10.497-1.236-.331-.956-1.913 1.06.284 1.985-7.406Zm-10.247.119a5.5 5.5 0 1 0-.147 10.97l.894-1.788a3.9 3.9 0 1 1-1.17-7.602l.423-1.58Zm4.519 2.979-5.5 11h11l-5.5-11Zm0 3.578-2.911 5.822h5.822L13.5 13.62Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
