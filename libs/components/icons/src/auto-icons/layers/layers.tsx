
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface LayersIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const LayersIcon = ({ color, style, ...props}: LayersIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M5.578 8 12 11.211 18.422 8 12 4.789 5.578 8Zm5.975-4.776L3.789 7.106a1 1 0 0 0 0 1.788l7.764 3.882a1 1 0 0 0 .894 0l7.764-3.882a1 1 0 0 0 0-1.788l-7.764-3.882a1 1 0 0 0-.894 0Z" clipRule="evenodd" /><path fillRule="evenodd" d="m5.579 12-1.789-.895h-.001a1 1 0 0 0 0 1.79l7.764 3.881a1 1 0 0 0 .894 0l7.764-3.882a1 1 0 0 0 0-1.788l-.001-.001-1.789.894.001.001L12 15.211 5.578 12Z" clipRule="evenodd" /><path fillRule="evenodd" d="M5.579 16.094 3.79 15.2h-.001a1 1 0 0 0 0 1.79l7.764 3.881a1 1 0 0 0 .894 0l7.764-3.882a1 1 0 0 0 0-1.789h-.001l-1.789.894.001.001L12 19.306l-6.422-3.211Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
