import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
/**
 * @deprecated Please use the icon from @toeverything/components/ui. If it does not exist, contact the designer to add。
 */
export const CloseIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <path
            fillRule="evenodd"
            d="M20.468 21.383 2.491 3.404l1.061-1.06L21.53 20.322l-1.06 1.06Z"
            clipRule="evenodd"
        />
        <path
            fillRule="evenodd"
            d="m3.15 21.516-1.06-1.06L20.067 2.478l1.06 1.06L3.152 21.516Z"
            clipRule="evenodd"
        />
    </SvgIcon>
);
