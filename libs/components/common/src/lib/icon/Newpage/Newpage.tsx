import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
/**
 * @deprecated Please use the icon from @toeverything/components/ui. If it does not exist, contact the designer to add。
 */
export const NewpageIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <g fillRule="evenodd" clipPath="url(#a)" clipRule="evenodd">
            <path d="M18.662 21.85H-.008V2.03h18.67v1.497l-17.17.002v16.82h15.67v-1.896h1.5v3.396Z" />
            <path d="M17.162 15.984h1.5V5.06h-1.5v10.923Z" />
            <path d="M12.676 11.272h10.66v-1.5h-10.66v1.5Z" />
        </g>
        <defs>
            <clipPath id="a">
                <path d="M0 0H24V24H0z" />
            </clipPath>
        </defs>
    </SvgIcon>
);
