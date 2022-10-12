import type { DOMAttributes, CSSProperties } from 'react';

type IconProps = {
  color?: string;
  style?: CSSProperties;
} & DOMAttributes<SVGElement>;

export const LogoIcon = ({
  color = '#000',
  style: propsStyle = {},
  ...props
}: IconProps) => {
  const style = { fill: color, ...propsStyle };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      {...props}
      style={style}
    >
      <path
        fillRule="evenodd"
        d="M10.552 2 4 21h3.838l4.168-13.14L16.176 21H20L13.447 2h-2.895Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

export const EdgelessIcon = ({
  color = '#000',
  style: propsStyle = {},
  ...props
}: IconProps) => {
  const style = { fill: color, ...propsStyle };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      {...props}
      style={style}
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

export const MoonIcon = ({
  color = '#000',
  style: propsStyle = {},
  ...props
}: IconProps) => {
  const style = { fill: color, ...propsStyle };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      {...props}
      style={style}
    >
      <path
        fillRule="evenodd"
        d="M9.549 3.314a.775.775 0 0 1-.136-.855.801.801 0 0 1 .746-.46c3.287.078 6.352 2.081 7.577 5.292 1.608 4.215-.569 8.911-4.862 10.49a8.407 8.407 0 0 1-9.044-2.138.775.775 0 0 1-.137-.855.802.802 0 0 1 .747-.46c.832.02 1.684-.11 2.51-.414 3.465-1.275 5.222-5.066 3.924-8.469a6.6 6.6 0 0 0-1.325-2.13Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

export const PaperIcon = ({
  color = '#000',
  style: propsStyle = {},
  ...props
}: IconProps) => {
  const style = { fill: color, ...propsStyle };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      {...props}
      style={style}
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

export const SunIcon = ({
  color = '#000',
  style: propsStyle = {},
  ...props
}: IconProps) => {
  const style = { fill: color, ...propsStyle };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      {...props}
      style={style}
    >
      <path
        fillRule="evenodd"
        d="M10.8 2.5a.8.8 0 0 0-1.6 0v.834a.8.8 0 1 0 1.6 0V2.5ZM5.15 4.018a.8.8 0 1 0-1.132 1.131l.678.679a.8.8 0 1 0 1.132-1.132l-.679-.678Zm10.832 1.131a.8.8 0 0 0-1.13-1.131l-.68.678a.8.8 0 1 0 1.132 1.132l.678-.679ZM10 5.867a4.133 4.133 0 1 0 0 8.267 4.133 4.133 0 0 0 0-8.267ZM2.5 9.2a.8.8 0 1 0 0 1.6h.834a.8.8 0 0 0 0-1.6H2.5Zm14.167 0a.8.8 0 1 0 0 1.6h.833a.8.8 0 0 0 0-1.6h-.833ZM5.827 15.31a.8.8 0 0 0-1.13-1.134l-.678.675a.8.8 0 0 0 1.129 1.134l.678-.675Zm9.476-1.134a.8.8 0 1 0-1.129 1.134l.679.675a.8.8 0 1 0 1.128-1.134l-.678-.675ZM10.8 16.667a.8.8 0 1 0-1.6 0v.833a.8.8 0 0 0 1.6 0v-.833Z"
        clipRule="evenodd"
      />
    </svg>
  );
};
