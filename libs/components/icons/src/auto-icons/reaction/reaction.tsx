
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ReactionIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const ReactionIcon = ({ color, style, ...props}: ReactionIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8Zm0 1.6c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" clipRule="evenodd" /><path fillRule="evenodd" d="M12 17.8A4.8 4.8 0 0 1 7.2 13h1.6a3.2 3.2 0 1 0 6.4 0h1.6a4.8 4.8 0 0 1-4.8 4.8Z" clipRule="evenodd" /><circle cx={8.5} cy={9.5} r={1.5} /><circle cx={15.5} cy={9.5} r={1.5} />
        </SvgIcon>
    )
};
