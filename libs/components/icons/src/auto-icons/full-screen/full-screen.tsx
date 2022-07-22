
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface FullScreenIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FullScreenIcon: FC<FullScreenIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Zm10.2 3.8H13V5.2h5.8V11h-1.6V8.063l-3.483 3.482-1.131-1.131L16.2 6.8Zm-5.72 5.72 1.132 1.13-3.55 3.55H11v1.6H5.2V13h1.6v3.2l3.68-3.68Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
