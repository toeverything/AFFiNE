
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SingleSelectIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SingleSelectIcon: FC<SingleSelectIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M18 4.6H6A1.4 1.4 0 0 0 4.6 6v12A1.4 1.4 0 0 0 6 19.4h12a1.4 1.4 0 0 0 1.4-1.4V6A1.4 1.4 0 0 0 18 4.6ZM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6Z" clipRule="evenodd" /><path d="M12.451 14.8a.61.61 0 0 1-.902 0l-3.421-3.936c-.303-.348-.034-.864.451-.864h6.842c.485 0 .754.516.451.864l-3.42 3.936Z" />
        </SvgIcon>
    )
};
