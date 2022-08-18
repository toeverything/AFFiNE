
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface SendBackwardIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const SendBackwardIcon = ({ color, style, ...props}: SendBackwardIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12.8 18.069V3h-1.6v15.069l-4.634-4.635-1.132 1.132L12 21.13l6.566-6.565-1.132-1.132L12.8 18.07Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
