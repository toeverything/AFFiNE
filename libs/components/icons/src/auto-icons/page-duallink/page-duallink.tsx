
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface PageDuallinkIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const PageDuallinkIcon: FC<PageDuallinkIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M4 2h9l7 7v13H7a3 3 0 0 1-3-3V2Zm14.4 18.4V9.663L12.337 3.6H5.6V19A1.4 1.4 0 0 0 7 20.4h11.4Z" clipRule="evenodd" /><path fillRule="evenodd" d="M12 10V2h1l7 7v1h-8Zm5.137-1.6L13.6 4.863V8.4h3.537Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
