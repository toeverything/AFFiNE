import { memo } from 'react';

export const UnknownUserIcon = memo(
  ({ width = 20, height = 20 }: { width?: number; height?: number }) => {
    const svgRaw = `<svg width="${width}" height="${height}" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g clip-path="url(#clip0_19485_742)">
    <rect width="20" height="20" rx="10" fill="currentColor" fill-opacity="0.1" />
    <path
      d="M10 10.9999C12.0829 10.9999 13.7714 9.29858 13.7714 7.1999C13.7714 5.10122 12.0829 3.3999 10 3.3999C7.91709 3.3999 6.22857 5.10122 6.22857 7.1999C6.22857 9.29858 7.91709 10.9999 10 10.9999Z"
      fill="currentColor" fill-opacity="0.3" />
    <path
      d="M1.5 22.3999C1.33431 22.3999 1.19948 22.2649 1.20496 22.0993C1.36224 17.3416 5.23972 13.5332 10 13.5332C14.7603 13.5332 18.6378 17.3416 18.795 22.0993C18.8005 22.2649 18.6657 22.3999 18.5 22.3999H1.5Z"
      fill="currentColor" fill-opacity="0.3" />
  </g>
  <defs>
    <clipPath id="clip0_19485_742">
      <rect width="20" height="20" rx="10" fill="white" />
    </clipPath>
  </defs>
</svg>`;

    return (
      <div
        style={{ lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: svgRaw }}
      />
    );
  }
);
UnknownUserIcon.displayName = 'UnknownUserIcon';
