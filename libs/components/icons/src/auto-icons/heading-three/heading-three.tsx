
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface HeadingThreeIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const HeadingThreeIcon: FC<HeadingThreeIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M2 20V4h1.6v16H2ZM14 4v16h-1.6V4H14Z" clipRule="evenodd" /><path fillRule="evenodd" d="M12.5 12.8h-9v-1.6h9v1.6Z" clipRule="evenodd" /><path d="M19.075 11c-.806 0-1.474.23-1.992.716-.553.485-.853 1.164-.922 2.037h1.325c.046-.521.207-.91.483-1.164.265-.255.634-.376 1.117-.376.473 0 .83.11 1.071.327.22.219.334.534.334.959 0 .424-.126.752-.368.97-.254.218-.622.328-1.106.328h-.575v1.067h.575c.53 0 .933.109 1.21.352.276.23.426.594.426 1.091 0 .413-.139.752-.403 1.031-.3.303-.715.461-1.233.461-.472 0-.852-.145-1.14-.424-.322-.304-.483-.74-.507-1.298H16c.07.97.392 1.722.967 2.232.519.46 1.21.691 2.062.691.898 0 1.624-.267 2.176-.788.53-.51.795-1.165.795-1.965 0-.51-.138-.934-.415-1.262-.253-.315-.633-.546-1.117-.703.91-.316 1.37-.946 1.37-1.893 0-.752-.253-1.334-.748-1.758-.506-.425-1.186-.631-2.015-.631Z" />
        </SvgIcon>
    )
};
