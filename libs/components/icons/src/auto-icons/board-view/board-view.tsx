
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface BoardViewIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const BoardViewIcon = ({ color, style, ...props}: BoardViewIconProps) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M12 17.4a5.4 5.4 0 1 0 0-10.8 5.4 5.4 0 0 0 0 10.8Zm7-5.4a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" clipRule="evenodd" /><path fillRule="evenodd" d="M18.565 8a.8.8 0 0 1 .8-.8c.797 0 1.511.07 2.07.24.5.15 1.172.477 1.334 1.202v.004c.089.405-.026.776-.186 1.065a3.165 3.165 0 0 1-.652.782c-.52.471-1.265.947-2.15 1.407-1.783.927-4.28 1.869-7.077 2.62-2.796.752-5.409 1.184-7.381 1.266-.98.04-1.848-.003-2.516-.162-.333-.079-.662-.196-.937-.38-.282-.19-.547-.48-.639-.892v-.002c-.138-.63.202-1.173.518-1.532.343-.39.836-.768 1.413-1.129a.8.8 0 0 1 .848 1.357c-.515.322-.862.605-1.06.83a1.524 1.524 0 0 0-.078.096c.07.03.169.064.304.095.461.11 1.163.158 2.08.12 1.822-.075 4.314-.481 7.033-1.212 2.718-.73 5.1-1.635 6.753-2.494.832-.433 1.441-.835 1.814-1.173.127-.115.213-.21.268-.284a1.67 1.67 0 0 0-.153-.053c-.342-.104-.878-.171-1.606-.171a.8.8 0 0 1-.8-.8Zm2.692 1.097-.004-.004a.026.026 0 0 1 .004.004Zm-18.46 5 .001-.002v.002Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
