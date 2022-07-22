import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

export const TableIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <g clipPath="url(#a)">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M6 4.6H18C18.7732 4.6 19.4 5.2268 19.4 6V7.99998L4.6 7.99997V6C4.6 5.2268 5.2268 4.6 6 4.6ZM9.6001 9.59997L19.4 9.59998V13.8L9.6001 13.8V9.59997ZM8.0001 13.8V9.59997L4.6 9.59997V13.8H8.0001ZM4.6 15.4H8.0001V19.4H6C5.2268 19.4 4.6 18.7732 4.6 18V15.4ZM9.6001 15.4L19.4 15.4V18C19.4 18.7732 18.7732 19.4 18 19.4H9.6001V15.4ZM3 6C3 4.34315 4.34315 3 6 3H18C19.6569 3 21 4.34315 21 6V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6Z" fill="#98ACBD"/>
        </g>
    </SvgIcon>
);
