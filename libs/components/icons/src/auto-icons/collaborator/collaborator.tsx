
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface CollaboratorIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const CollaboratorIcon = ({ color, style, ...props}: CollaboratorIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 10.4a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8Zm0 1.6a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10 14.8A5.2 5.2 0 0 0 4.8 20v1H3.2v-1a6.8 6.8 0 0 1 6.8-6.8h4a6.8 6.8 0 0 1 6.8 6.8v1h-1.6v-1a5.2 5.2 0 0 0-5.2-5.2h-4Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
