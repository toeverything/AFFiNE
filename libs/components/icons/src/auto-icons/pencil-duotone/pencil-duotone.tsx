
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface PencilDuotoneIconProps extends Omit<SvgIconProps, 'color'> {
    color0?: string
    primaryColor?: string
    color1?: string
    secondaryColor?: string
}

export const PencilDuotoneIcon: FC<PencilDuotoneIconProps> = ({ color0, primaryColor, color1, secondaryColor, style, ...props}) => {
    const propsStyles = {"--color-0": color0 || primaryColor, "--color-1": color1 || secondaryColor};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path style={{fill: 'var(--color-0)'}} fillRule="evenodd" d="M6 18 19 5l1.414 1.414-13 13L6 18Z" clipRule="evenodd" /><path style={{fill: 'var(--color-1)'}} fillRule="evenodd" d="m6.015 17.015.383-1.15L17.131 5.13A1.228 1.228 0 0 1 18.87 6.87L8.136 17.602l-1.15.383-.971-.97Zm-.881-2.149L16 4a2.828 2.828 0 1 1 4 4L9.134 18.866a.8.8 0 0 1-.313.194l-4.303 1.434a.8.8 0 0 1-1.012-1.012L4.94 15.18a.8.8 0 0 1 .194-.313Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
