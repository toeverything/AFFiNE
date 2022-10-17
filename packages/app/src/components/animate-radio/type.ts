import { CSSProperties, DOMAttributes, ReactElement } from 'react';

export type ItemStatus = 'normal' | 'stretch' | 'shrink';

export type RadioItemStatus = {
  left: ItemStatus;
  right: ItemStatus;
};
export type AnimateRadioProps = {
  labelLeft: string;
  labelRight: string;
  iconLeft: ReactElement;
  iconRight: ReactElement;
  isHover: boolean;
  initialValue?: 'left' | 'right';
  style?: CSSProperties;
  onChange?: (value: 'left' | 'right') => void;
};
export type AnimateRadioItemProps = {
  active: boolean;
  status: ItemStatus;
  label: string;
  icon: ReactElement;
  isLeft: boolean;
} & DOMAttributes<HTMLDivElement>;
