
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface BorderColorNoneIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BorderColorNoneIcon: FC<BorderColorNoneIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M13.286 5.571h2.571V3m2.572 5.143a2.571 2.571 0 0 0-2.565-2.572h2.565v2.572Zm0 2.571V8.143h2.57v2.571h-2.57Zm0 5.143v-5.143 2.572h2.57v2.571h-2.57Zm-2.562 2.572a2.572 2.572 0 0 0 2.562-2.572v2.572h-2.562Zm-2.581 0h2.571V21h-2.571v-2.571Zm-5.143 0h2.571V21H8.143v-2.571ZM5.57 15.876a2.571 2.571 0 0 0 2.562 2.553H5.571v-2.553Zm0-.019v-2.571H3v2.571h2.571Zm0 4.455a5.169 5.169 0 0 1-1.883-1.883h1.883v1.883Zm14.741-1.883a5.169 5.169 0 0 1-1.884 1.883v-1.883h1.884ZM18.428 3.688a5.168 5.168 0 0 1 1.884 1.883h-1.883V3.688ZM3 10.714h2.571V8.143H3v2.571Zm.688-5.143h1.883V3.688a5.168 5.168 0 0 0-1.883 1.883ZM8.143 3v2.571h2.571V3H8.143Zm-.007 2.571H5.571v2.553a2.571 2.571 0 0 1 2.565-2.553ZM15.857 3h-2.571v2.571" clipRule="evenodd" />
        </SvgIcon>
    )
};
