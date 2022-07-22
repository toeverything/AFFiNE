import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
/**
 * @deprecated Please use the icon from @toeverything/components/ui. If it does not exist, contact the designer to add。
 */
export const ListIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <path d="M5.98 10.86v1.78h4.45v-1.78H5.98ZM5.98 15.52v1.78h7.55v-1.78H5.98ZM5.98 6.2v1.78h11.55V6.2H5.98Z" />
        <path
            fillRule="evenodd"
            d="M1 22.5V1h21.5v21.5H1ZM2.5 21H21V2.5H2.5V21Z"
            clipRule="evenodd"
        />
    </SvgIcon>
);
