import type { HTMLAttributes, PropsWithChildren } from 'react';

export interface SkeletonProps
  extends PropsWithChildren,
    HTMLAttributes<HTMLElement> {
  /**
   * The animation. If `false` the animation effect is disabled.
   */
  animation?: 'pulse' | 'wave' | false;

  /**
   * The type of content that will be rendered.
   * @default `'text'`
   */
  variant?: 'circular' | 'rectangular' | 'rounded' | 'text' | string;

  /**
   * Width of the skeleton. Useful when the skeleton is inside an inline element with no width of its own.
   */
  width?: number | string;

  /**
   * Height of the skeleton. Useful when you don't want to adapt the skeleton to a text element but for instance a card.
   */
  height?: number | string;

  /**
   * Wrapper component. If not provided, the default element is a div.
   */
  wrapper?: string;
}

export type PickStringFromUnion<T> = T extends string ? T : never;
