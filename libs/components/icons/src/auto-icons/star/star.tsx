
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface StarIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const StarIcon = ({ color, style, ...props}: StarIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M13.52 10.698 12 6.728l-1.52 3.97-4.072.29L9.54 13.73l-.996 4.149L12 15.604l3.456 2.275-.996-4.149 3.132-2.742-4.071-.29Zm6.999-1.235c.463.033.652.642.295.954l-4.503 3.944 1.432 5.965c.113.473-.38.848-.773.59L12 17.645l-4.97 3.27c-.393.26-.886-.116-.773-.589l1.432-5.965-4.503-3.944c-.357-.313-.168-.92.295-.954l5.854-.416 2.187-5.708a.507.507 0 0 1 .956 0l2.187 5.708 5.854.416Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
