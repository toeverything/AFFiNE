import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
/**
 * @deprecated Please use the icon from @toeverything/components/ui. If it does not exist, contact the designer to add。
 */
export const DocumentIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <path
            fillRule="evenodd"
            d="M4 4v16h15V8.616L14.055 4H4Zm1.28 1.253h7.879v4.26h4.561v9.234H5.28V5.253Zm9.159.837 2.323 2.169h-2.324v-2.17Z"
            clipRule="evenodd"
        />
        <path
            fillRule="evenodd"
            d="M7.053 8.758h4.162V7.505H7.053v1.253ZM7.053 12.835h8.723V11.58H7.053v1.254ZM7.053 16.836h8.723v-1.253H7.053v1.253Z"
            clipRule="evenodd"
        />
    </SvgIcon>
);
