import { CSSProperties, DOMAttributes } from 'react';

type IconProps = {
  color?: string;
  style?: CSSProperties;
} & DOMAttributes<SVGElement>;

export const ArrowIcon = ({
  color,
  style: propsStyle = {},
  direction = 'right',
  ...props
}: IconProps & { direction?: 'left' | 'right' | 'middle' }) => {
  const style = {
    fill: color,
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
      fill="none"
      {...props}
      style={style}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.602933 0.305738C0.986547 0.0865297 1.47523 0.219807 1.69444 0.603421L5.41093 7.10728C5.72715 7.66066 5.72715 8.34 5.41093 8.89338L1.69444 15.3972C1.47523 15.7809 0.986547 15.9141 0.602933 15.6949C0.219319 15.4757 0.0860414 14.987 0.305249 14.6034L4.02174 8.09956C4.05688 8.03807 4.05688 7.96259 4.02174 7.9011L0.305249 1.39724C0.0860414 1.01363 0.219319 0.524946 0.602933 0.305738Z"
        fill="#6880FF"
      />
    </svg>
  );
};
