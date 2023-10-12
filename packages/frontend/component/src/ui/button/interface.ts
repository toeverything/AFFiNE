import type {
  CSSProperties,
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
} from 'react';

export const SIZE_SMALL = 'small' as const;
export const SIZE_MIDDLE = 'middle' as const;
export const SIZE_DEFAULT = 'default' as const;

export type ButtonProps = PropsWithChildren &
  Omit<HTMLAttributes<HTMLButtonElement>, 'type'> & {
    size?: typeof SIZE_SMALL | typeof SIZE_MIDDLE | typeof SIZE_DEFAULT;
    disabled?: boolean;
    hoverBackground?: CSSProperties['background'];
    hoverColor?: CSSProperties['color'];
    hoverStyle?: CSSProperties;
    icon?: ReactElement;
    iconPosition?: 'start' | 'end';
    shape?: 'default' | 'round' | 'circle';
    type?: 'primary' | 'light' | 'warning' | 'danger' | 'default';
    bold?: boolean;
    loading?: boolean;
    noBorder?: boolean;
  };
