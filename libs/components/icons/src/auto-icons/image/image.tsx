
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ImageIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ImageIcon: FC<ImageIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M19 5.6H5A1.4 1.4 0 0 0 3.6 7v10A1.4 1.4 0 0 0 5 18.4h14a1.4 1.4 0 0 0 1.4-1.4V7A1.4 1.4 0 0 0 19 5.6ZM5 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H5Z" clipRule="evenodd" /><path fillRule="evenodd" d="m16.25 8.057 5.184 3.348-.868 1.344-4.345-2.806-12.807 7.742-.828-1.37L16.25 8.057Z" clipRule="evenodd" /><circle cx={6.5} cy={9.5} r={1.5} />
        </SvgIcon>
    )
};
