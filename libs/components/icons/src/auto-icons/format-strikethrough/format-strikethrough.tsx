
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface FormatStrikethroughIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const FormatStrikethroughIcon: FC<FormatStrikethroughIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 12.8H4v-1.6h17v1.6Z" clipRule="evenodd" /><path fillRule="evenodd" d="m16.576 6.966 1.282-.953C16.584 4.004 14.535 3 11.709 3c-1.587 0-2.947.352-4.081 1.056-1.221.755-1.831 1.862-1.831 3.322 0 .274.008.472.026.592.07.446.209.85.418 1.21.227.36.462.661.707.902.261.223.645.463 1.15.72.524.258.96.456 1.309.593.366.137.916.335 1.648.592.053.034.14.06.262.077.663.24 1.107.395 1.334.464l.082.032h3.831a4.875 4.875 0 0 0-.198-.135c-.593-.378-1.317-.738-2.171-1.082a90.081 90.081 0 0 1-1.335-.54c-.209-.07-.619-.198-1.23-.387-.592-.206-.95-.326-1.072-.36-.855-.275-1.535-.618-2.04-1.03-.576-.48-.864-1.073-.864-1.777 0-.927.384-1.631 1.151-2.112.768-.48 1.814-.72 3.14-.72.994 0 1.892.222 2.694.669a4.932 4.932 0 0 1 1.937 1.88Zm1.307 7.194h-2.122c.105.102.185.202.239.3.262.583.392 1.124.392 1.621 0 .55-.087 1.005-.261 1.365-.314.738-.907 1.27-1.78 1.597-.767.309-1.621.463-2.563.463-2.983 0-4.832-1.296-5.547-3.888l-1.491.644c.122.686.366 1.313.733 1.88.575.961 1.5 1.7 2.773 2.214a9.005 9.005 0 0 0 3.401.644c2.023 0 3.628-.438 4.814-1.313 1.186-.893 1.779-2.112 1.779-3.657 0-.693-.122-1.316-.367-1.87Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
