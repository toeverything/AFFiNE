/* eslint-disable no-restricted-imports */

import type { SvgIconProps as MuiSvgIconProps } from '@mui/material';

export { SvgIcon } from '@mui/material';
export interface SvgIconProps extends Omit<MuiSvgIconProps, 'color'> {
    color?: string;
}
