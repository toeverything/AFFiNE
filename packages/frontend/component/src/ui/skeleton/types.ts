import type { HTMLAttributes, PropsWithChildren } from 'react';

/**
 * @reference These props are migrated from [MUI Skeleton props](https://mui.com/material-ui/api/skeleton/#props)
 */
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
  variant?: 'circular' | 'rectangular' | 'rounded' | 'text';

  /**
   * Width of the skeleton. Useful when the skeleton is inside an inline element with no width of its own.
   * Number values are treated as pixels.
   */
  width?: number | string;

  /**
   * Height of the skeleton. Useful when you don't want to adapt the skeleton to a text element but for instance a card.
   * Number values are treated as pixels.
   */
  height?: number | string;

  /**
   * Flex of the skeleton.
   */
  flex?: number | string;
}

export type PickStringFromUnion<T> = T extends string ? T : never;
