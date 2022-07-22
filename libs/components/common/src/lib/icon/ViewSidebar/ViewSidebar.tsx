import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
/**
 * @deprecated Please use the icon from @toeverything/components/ui. If it does not exist, contact the designer to add。
 */
export const ViewSidebarIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <g clipPath="url(#a)">
            <path d="M2 22.5V1h21.5v21.5H2ZM3.66 2.662v18.177h18.177V2.662H3.661Z" />
            <path d="M17.842 21.369V1h-1.698v20.369h1.698Z" />
        </g>
        <defs>
            <clipPath id="a">
                <path d="M0 0H24V24H0z" transform="rotate(90 12 12)" />
            </clipPath>
        </defs>
    </SvgIcon>
);
