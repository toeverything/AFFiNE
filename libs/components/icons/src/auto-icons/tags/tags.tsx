
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface TagsIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const TagsIcon: FC<TagsIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21.38 10.088a2 2 0 0 1-.578 1.595l-8.53 8.53a2 2 0 0 1-2.828 0l-5.657-5.657a2 2 0 0 1 0-2.828l8.53-8.53a2 2 0 0 1 1.595-.578l5.186.472a2 2 0 0 1 1.81 1.81l.472 5.186Zm-2.065-5.04.471 5.185a.4.4 0 0 1-.115.319l-8.53 8.53a.4.4 0 0 1-.566 0l-5.657-5.657a.4.4 0 0 1 0-.566l8.53-8.53a.4.4 0 0 1 .32-.115l5.185.471a.4.4 0 0 1 .362.362Z" clipRule="evenodd" /><path d="M15 7.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z" />
        </SvgIcon>
    )
};
