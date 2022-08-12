
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface HelpCenterIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const HelpCenterIcon = ({ color, style, ...props}: HelpCenterIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0 1a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" clipRule="evenodd" /><path d="M12.07 8.1c-.789 0-1.41.244-1.865.732-.433.467-.655 1.088-.655 1.865h.888c0-.544.122-.966.355-1.276.277-.367.688-.544 1.232-.544.466 0 .832.122 1.099.388.244.244.366.589.366 1.032 0 .311-.111.6-.322.877-.078.089-.2.222-.377.4-.6.533-.977.954-1.121 1.287-.144.278-.211.6-.211.966v.255h.899v-.255c0-.3.066-.577.21-.822.112-.2.278-.4.511-.599.489-.433.8-.721.91-.854.267-.367.411-.8.411-1.299 0-.666-.21-1.187-.622-1.565-.421-.4-.998-.588-1.709-.588Zm-.156 6.759c-.2 0-.355.055-.477.189a.604.604 0 0 0-.2.466c0 .188.067.344.2.477a.643.643 0 0 0 .477.189.7.7 0 0 0 .477-.19.643.643 0 0 0 .189-.476.636.636 0 0 0-.189-.466.635.635 0 0 0-.477-.19Z" />
        </SvgIcon>
    )
};
