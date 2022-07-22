
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface LocationIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const LocationIcon: FC<LocationIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M4.856 9.3c0-3.927 3.204-7.1 7.145-7.1 3.94 0 7.143 3.173 7.143 7.1 0 1.18-.579 2.674-1.299 4.112-.946 1.893-2.253 3.915-3.312 5.451a73.958 73.958 0 0 1-1.86 2.574l-.028.038-.01.012v.002L12 21l-.634.489-.01-.014-.03-.038a73.97 73.97 0 0 1-1.86-2.573c-1.059-1.537-2.366-3.56-3.312-5.452-.718-1.436-1.299-2.933-1.299-4.113ZM12.001 21l-.634.489.634.82.633-.82-.633-.489Zm0-1.336c.322-.44.745-1.028 1.215-1.709 1.045-1.515 2.302-3.465 3.198-5.258.716-1.43 1.13-2.628 1.13-3.398C17.544 6.268 15.067 3.8 12 3.8c-3.068 0-5.545 2.468-5.545 5.5 0 .769.415 1.967 1.13 3.397.896 1.793 2.154 3.743 3.199 5.258.47.68.893 1.269 1.216 1.709Zm0-12.239a1.919 1.919 0 1 0-.002 3.837A1.919 1.919 0 0 0 12 7.425ZM8.48 9.344a3.519 3.519 0 1 1 7.037 0 3.519 3.519 0 0 1-7.037 0Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
