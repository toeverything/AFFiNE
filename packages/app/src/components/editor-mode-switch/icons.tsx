import { CSSProperties, DOMAttributes } from 'react';

type IconProps = {
  style?: CSSProperties;
} & DOMAttributes<SVGElement>;

export const ArrowIcon = ({
  style: propsStyle = {},
  direction = 'right',
  ...props
}: IconProps & { direction?: 'left' | 'right' | 'middle' }) => {
  const style = {
    transform: `rotate(${direction === 'left' ? '0' : '180deg'})`,
    opacity: direction === 'middle' ? 0 : 1,
    ...propsStyle,
  };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="6"
      height="16"
      viewBox="0 0 6 16"
      fill="currentColor"
      {...props}
      style={style}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.602933 0.305738C0.986547 0.0865297 1.47523 0.219807 1.69444 0.603421L5.41093 7.10728C5.72715 7.66066 5.72715 8.34 5.41093 8.89338L1.69444 15.3972C1.47523 15.7809 0.986547 15.9141 0.602933 15.6949C0.219319 15.4757 0.0860414 14.987 0.305249 14.6034L4.02174 8.09956C4.05688 8.03807 4.05688 7.96259 4.02174 7.9011L0.305249 1.39724C0.0860414 1.01363 0.219319 0.524946 0.602933 0.305738Z"
      />
    </svg>
  );
};

export const PaperIcon = ({ style = {}, ...props }: IconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      style={style}
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M17 9.8H7V8.2h10v1.6ZM12 12.8H7v-1.6h5v1.6Z"
        clipRule="evenodd"
      />
      <path d="m14 19 7-7h-5a2 2 0 0 0-2 2v5Z" />
      <path
        fillRule="evenodd"
        d="M5 6.6h14c.22 0 .4.18.4.4v6.6L21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9l1.6-1.6H5a.4.4 0 0 1-.4-.4V7c0-.22.18-.4.4-.4Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

export const EdgelessIcon = ({ style = {}, ...props }: IconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      style={style}
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M12 17.4a5.4 5.4 0 1 0 0-10.8 5.4 5.4 0 0 0 0 10.8Zm7-5.4a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        clipRule="evenodd"
      />
      <path
        fillRule="evenodd"
        d="M18.565 8a.8.8 0 0 1 .8-.8c.797 0 1.511.07 2.07.24.5.15 1.172.477 1.334 1.202v.004c.089.405-.026.776-.186 1.065a3.165 3.165 0 0 1-.652.782c-.52.471-1.265.947-2.15 1.407-1.783.927-4.28 1.869-7.077 2.62-2.796.752-5.409 1.184-7.381 1.266-.98.04-1.848-.003-2.516-.162-.333-.079-.662-.196-.937-.38-.282-.19-.547-.48-.639-.892v-.002c-.138-.63.202-1.173.518-1.532.343-.39.836-.768 1.413-1.129a.8.8 0 0 1 .848 1.357c-.515.322-.862.605-1.06.83a1.524 1.524 0 0 0-.078.096c.07.03.169.064.304.095.461.11 1.163.158 2.08.12 1.822-.075 4.314-.481 7.033-1.212 2.718-.73 5.1-1.635 6.753-2.494.832-.433 1.441-.835 1.814-1.173.127-.115.213-.21.268-.284a1.67 1.67 0 0 0-.153-.053c-.342-.104-.878-.171-1.606-.171a.8.8 0 0 1-.8-.8Zm2.692 1.097-.004-.004a.026.026 0 0 1 .004.004Zm-18.46 5 .001-.002v.002Z"
        clipRule="evenodd"
      />
    </svg>
  );
};
