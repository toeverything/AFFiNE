
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface SelectIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SelectIcon: FC<SelectIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <g clipPath="url(#a)"><path fillRule="evenodd" d="M5.61 4.222c0-1.354 1.577-2.094 2.62-1.23l11.582 9.593c1.218 1.008.394 2.909-1.085 2.89-1.008-.014-2.157.01-3.23.12-1.091.112-2.03.308-2.661.605-.631.296-1.382.894-2.165 1.661-.77.756-1.521 1.626-2.155 2.41-.93 1.151-2.918.572-2.917-1.009l.01-15.04Zm1.6.001-.01 15.04v.002c.003.003.01.006.019.01a.075.075 0 0 0 .039.003l.003-.001s.004-.002.01-.01c.655-.811 1.45-1.733 2.28-2.548.82-.803 1.725-1.554 2.604-1.967.88-.414 2.036-.631 3.177-.749 1.158-.12 2.375-.142 3.416-.128.01 0 .015-.002.015-.002l.003-.001a.075.075 0 0 0 .022-.033.07.07 0 0 0 .005-.02l-.001-.002L7.209 4.223Z" clipRule="evenodd" /></g><defs><clipPath id="a"><path d="M0 0H24V24H0z" /></clipPath></defs>
        </SvgIcon>
    )
};
