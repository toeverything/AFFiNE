import type { SVGProps } from 'react';

export const PlusSidebarIcon = ({ width, height }: SVGProps<SVGElement>) => (
  <svg
    width={width ?? 24}
    height={height ?? 24}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 4.5C12.5523 4.5 13 4.94772 13 5.5V11H18.5C19.0523 11 19.5 11.4477 19.5 12C19.5 12.5523 19.0523 13 18.5 13H13V18.5C13 19.0523 12.5523 19.5 12 19.5C11.4477 19.5 11 19.0523 11 18.5V13H5.5C4.94772 13 4.5 12.5523 4.5 12C4.5 11.4477 4.94772 11 5.5 11H11V5.5C11 4.94772 11.4477 4.5 12 4.5Z"
      fill="#77757D"
    />
  </svg>
);

export const ArrowRightSidebarIcon = ({
  width,
  height,
}: SVGProps<SVGElement>) => (
  <svg
    width={width ?? 24}
    height={height ?? 24}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.26285 5.92429C7.88965 6.33141 7.91716 6.96397 8.32428 7.33717L13.5201 12.1L8.32428 16.8629C7.91716 17.2361 7.88965 17.8686 8.26285 18.2757C8.63604 18.6829 9.26861 18.7104 9.67572 18.3372L15.6757 12.8372C15.8824 12.6478 16 12.3803 16 12.1C16 11.8197 15.8824 11.5523 15.6757 11.3629L9.67572 5.86286C9.26861 5.48967 8.63604 5.51717 8.26285 5.92429Z"
      fill="#77757D"
    />
  </svg>
);
