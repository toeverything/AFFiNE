
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface UnlockIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const UnlockIcon: FC<UnlockIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 11.6H6a.4.4 0 0 0-.4.4v8c0 .22.18.4.4.4h12a.4.4 0 0 0 .4-.4v-8a.4.4 0 0 0-.4-.4ZM6 10a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H6ZM7.2 7a4.8 4.8 0 0 1 9.6 0v3h-1.6V7a3.2 3.2 0 0 0-6.4 0H7.2Z" clipRule="evenodd" /><circle cx={12} cy={16} r={2} />
        </SvgIcon>
    )
};
