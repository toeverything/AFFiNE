import { DOMAttributes, ReactElement } from 'react';

export type ItemStatus = 'normal' | 'stretch' | 'shrink' | 'hidden';

export type RadioItemStatus = {
  left: ItemStatus;
  right: ItemStatus;
};
export type AnimateRadioItemProps = {
  active: boolean;
  status: ItemStatus;
  label: string;
  icon: ReactElement;
  isLeft: boolean;
} & DOMAttributes<HTMLDivElement>;
