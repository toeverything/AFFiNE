import type { PropsWithChildren } from 'react';

import { shadowSticker } from './style.css';

interface ShadowStickerProps extends PropsWithChildren {
  color?: string;
  width?: number;
  animate?: boolean;
}

export const ShadowSticker = ({
  color = '#F9E8FF',
  width,
  animate = true,
  children,
}: ShadowStickerProps) => {
  return (
    <div
      data-animate={animate}
      className={shadowSticker}
      style={{
        backgroundColor: color,
        width,
      }}
    >
      {children}
    </div>
  );
};
