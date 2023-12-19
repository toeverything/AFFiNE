import type { ReactNode } from 'react';

export type OnboardingStep = 'enter' | 'unfold' | 'mode-switch';
export type ArticleId = '0' | '1' | '2' | '3' | '4';

/**
 * Paper enter animation options
 */
export interface PaperEnterOptions {
  // animation-curve
  curveCenter: number;
  curve: number;

  // animation-move
  fromZ: number;
  fromX: number;
  fromY: number;
  fromRotateX: number;
  fromRotateY: number;
  fromRotateZ: number;
  toZ: number;
  toRotateZ: number;

  // move-in animation config
  duration: number | string;
  delay: number;
  easing: string;
}

export interface ArticleOption {
  /** article id */
  id: ArticleId;

  /** paper enter animation content */
  brief: ReactNode;

  /** paper enter animation configuration */
  enterOptions: PaperEnterOptions;

  /** Locate paper */
  location: {
    /** offset X */
    x: number;
    /** offset Y */
    y: number;
  };
}
