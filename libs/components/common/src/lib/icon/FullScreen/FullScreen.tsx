import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

export const FullScreenIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <g clipPath="url(#a)">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M6 3C4.34315 3 3 4.34315 3 6V18C3 19.6569 4.34315 21 6 21H18C19.6569 21 21 19.6569 21 18V6C21 4.34315 19.6569 3 18 3H6ZM16.2 6.79995H13V5.19995H18.8V11H17.2V8.0627L13.7174 11.5453L12.586 10.4139L16.2 6.79995ZM10.4808 12.5191L11.6122 13.6504L8.0626 17.2H11V18.8L5.19995 18.8V13H6.79995L6.79995 16.2L10.4808 12.5191Z" fill="#98ACBD"/>
        </g>
    </SvgIcon>
);
