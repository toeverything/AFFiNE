import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

export const SorterIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <g clipPath="url(#a)">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M9 4.6H5C4.77909 4.6 4.6 4.77909 4.6 5V9C4.6 9.22091 4.77909 9.4 5 9.4H9C9.22091 9.4 9.4 9.22091 9.4 9V5C9.4 4.77909 9.22091 4.6 9 4.6ZM5 3C3.89543 3 3 3.89543 3 5V9C3 10.1046 3.89543 11 5 11H9C10.1046 11 11 10.1046 11 9V5C11 3.89543 10.1046 3 9 3H5Z" fill="#98ACBD"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M5 13C3.89543 13 3 13.8954 3 15V19C3 20.1046 3.89543 21 5 21H9C10.1046 21 11 20.1046 11 19V15C11 13.8954 10.1046 13 9 13H5ZM6.16661 19.3819L9.92421 15.6243L9.07568 14.7758L6.16661 17.6848L4.92421 16.4424L4.07568 17.291L6.16661 19.3819Z" fill="#98ACBD"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M18 17.8687L20.4343 15.4343L21.5657 16.5657L17 21.1314L12.4343 16.5657L13.5657 15.4343L16 17.8686L16 3H18L18 17.8687Z" fill="#98ACBD"/>
        </g>
    </SvgIcon>
);
