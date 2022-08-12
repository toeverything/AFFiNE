
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface HeadingTwoIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const HeadingTwoIcon = ({ color, style, ...props}: HeadingTwoIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M2 20V4h1.6v16H2ZM14 4v16h-1.6V4H14Z" clipRule="evenodd" /><path fillRule="evenodd" d="M12.5 12.8h-9v-1.6h9v1.6Z" clipRule="evenodd" /><path d="M19.133 11c-.928 0-1.675.321-2.241.964-.555.606-.832 1.397-.844 2.386h1.41c.024-.692.169-1.224.434-1.57.265-.37.662-.556 1.192-.556.494 0 .868.111 1.12.346.242.235.374.594.374 1.076 0 .494-.192.964-.566 1.397-.24.26-.627.593-1.18.989-1 .704-1.663 1.248-1.977 1.62C16.277 18.318 16 19.096 16 20h6v-1.273h-4.241c.193-.445.723-.965 1.602-1.558.844-.581 1.446-1.05 1.784-1.422.554-.63.843-1.322.843-2.089 0-.791-.265-1.422-.795-1.916-.542-.495-1.23-.742-2.06-.742Z" />
        </SvgIcon>
    )
};
