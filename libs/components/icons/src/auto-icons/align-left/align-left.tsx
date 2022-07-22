
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface AlignLeftIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const AlignLeftIcon: FC<AlignLeftIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M2 4h20v1.6H2V4ZM2 9h14v1.6H2V9ZM22 15H2v-1.6h20V15ZM16 20H2v-1.6h14V20Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
