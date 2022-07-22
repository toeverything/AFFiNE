
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SortIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SortIcon: FC<SortIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M9 4.6H5a.4.4 0 0 0-.4.4v4c0 .22.18.4.4.4h4a.4.4 0 0 0 .4-.4V5a.4.4 0 0 0-.4-.4ZM5 3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5ZM5 13a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5Zm1.167 6.382 3.757-3.758-.848-.848-2.91 2.909-1.242-1.243-.848.849 2.09 2.09ZM18 17.869l2.434-2.435 1.132 1.132L17 21.13l-4.566-4.565 1.132-1.132L16 17.87V3h2v14.869Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
