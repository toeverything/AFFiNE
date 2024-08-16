import type { RadioGroupItemProps } from '@radix-ui/react-radio-group';
import type { CSSProperties, ReactNode } from 'react';

type SimpleRadioItem = string;

export interface RadioProps extends RadioGroupItemProps {
  items: RadioItem[] | SimpleRadioItem[];
  value: any;
  onChange?: (value: any) => void;

  /**
   * Total width of the radio group, items will be evenly distributed
   */
  width?: CSSProperties['width'];
  /**
   * Distance between outer wrapper and items (in pixels)
   * @default 2
   */
  padding?: number;
  /**
   * Distance between items (in pixels)
   * @default 4
   */
  gap?: number;
  /**
   * Outer border radius (in pixels), the inner item's border radius will be calculated based on `padding` and `borderRadius`
   * @default 10
   */
  borderRadius?: number;
  /**
   * Height of the inner item (in pixels)
   * @default 28
   */
  itemHeight?: number;

  /**
   * Custom duration for the indicator animation
   * @default 250
   */
  animationDuration?: number | string;
  /**
   * Custom easing function for the indicator animation
   * @default 'cubic-bezier(.18,.22,0,1)'
   */
  animationEasing?: string;
  /** Customize active item's className */
  activeItemClassName?: string;
  /** Customize active item's style */
  activeItemStyle?: CSSProperties;
  /** Customize indicator's className */
  indicatorClassName?: string;
  /** Customize indicator's style */
  indicatorStyle?: CSSProperties;
  /**
   * This prop is used to use a different color scheme
   */
  iconMode?: boolean;
}

export interface RadioItem {
  value: string;
  label?: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** bind `data-testid` */
  testId?: string;
  /** Customize button-element's html attributes */
  attrs?: Partial<
    Omit<React.HTMLAttributes<HTMLButtonElement>, 'className' | 'style'>
  > &
    Record<`data-${string}`, string>;
  customRender?: (
    item: Omit<RadioItem, 'customRender'>,
    index: number
  ) => ReactNode;
}
