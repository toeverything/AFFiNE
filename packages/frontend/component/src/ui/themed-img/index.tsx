import { useTheme } from 'next-themes';
import { forwardRef, type HTMLAttributes } from 'react';

export interface ThemedImgProps
  extends Omit<HTMLAttributes<HTMLImageElement>, 'src'> {
  lightSrc: string;
  darkSrc?: string;
}

export const ThemedImg = forwardRef<HTMLImageElement, ThemedImgProps>(
  function ThemedImg({ lightSrc, darkSrc, ...attrs }, ref) {
    const { resolvedTheme } = useTheme();
    const src = resolvedTheme === 'dark' && darkSrc ? darkSrc : lightSrc;

    return <img ref={ref} src={src} {...attrs} />;
  }
);
