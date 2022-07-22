
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface ArrowIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ArrowIcon: FC<ArrowIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M9.6 11.4v8h4.8v-8h3.56L12 5.079 6.04 11.4H9.6Zm2-8.23a.554.554 0 0 1 .8 0l8.461 8.974c.311.33.066.856-.4.856H16v7.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5V13H3.538c-.465 0-.71-.526-.4-.856l8.463-8.974Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
