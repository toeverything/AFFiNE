
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface GroupByIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const GroupByIcon = ({ color, style, ...props}: GroupByIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M21 3.8a.8.8 0 0 1-.8.8h-6.4a.8.8 0 0 1 0-1.6h6.4a.8.8 0 0 1 .8.8ZM11 3.8a.8.8 0 0 1-.8.8H3.8a.8.8 0 1 1 0-1.6h6.4a.8.8 0 0 1 .8.8ZM19 8.6h-4a.4.4 0 0 0-.4.4v10c0 .22.18.4.4.4h4a.4.4 0 0 0 .4-.4V9a.4.4 0 0 0-.4-.4ZM15 7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4Z" clipRule="evenodd" /><rect width={8} height={9} x={3} y={7} rx={2} />
        </SvgIcon>
    )
};
