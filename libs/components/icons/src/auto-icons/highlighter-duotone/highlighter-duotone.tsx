
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface HighlighterDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
    color1?: string
    secondaryColor?: string
}

export const HighlighterDuotoneIcon: FC<HighlighterDuotoneIconProps> = ({ color0, primaryColor, color1, secondaryColor, style, ...props}) => {
    const propsStyles = {"--color-0": color0 || primaryColor, "--color-1": color1 || secondaryColor};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path style={{fill: 'var(--color-0)'}} fillRule="evenodd" d="M21 21H3v-3h18v3Z" clipRule="evenodd" /><path style={{fill: 'var(--color-1)'}} fillRule="evenodd" d="m6.847 15.53-.376 1.129.87.87 1.13-.376L18.892 6.732a1.148 1.148 0 1 0-1.624-1.624L6.847 15.529Zm9.29-11.553L5.582 14.53a.8.8 0 0 0-.193.313L4.174 18.49 3 19.663 4.337 21l1.174-1.174 3.645-1.215a.8.8 0 0 0 .313-.193L20.023 7.863a2.748 2.748 0 1 0-3.886-3.886Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
