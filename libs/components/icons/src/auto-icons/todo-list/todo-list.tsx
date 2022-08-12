
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface TodoListIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const TodoListIcon = ({ color, style, ...props}: TodoListIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M10 4.2h11v1.6H10V4.2ZM10 18.2h11v1.6H10v-1.6ZM10 11.2h11v1.6H10v-1.6ZM7.576 2.776l.848.848L5 7.05 3.076 5.124l.848-.848L5 5.35l2.576-2.575ZM7.576 16.776l.848.848L5 21.05l-1.924-1.925.848-.848L5 19.352l2.576-2.576ZM7.576 9.776l.848.848L5 14.05l-1.924-1.925.848-.848L5 12.35l2.576-2.575Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
