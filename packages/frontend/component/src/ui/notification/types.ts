import type { ReactNode } from 'react';

import type { ButtonProps } from '../button';

export type NotificationStyle = 'normal' | 'information' | 'alert';
export type NotificationTheme = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  style?: NotificationStyle;
  theme?: NotificationTheme;

  borderColor?: string;
  background?: string;
  foreground?: string;
  alignMessage?: 'title' | 'icon';
  action?: {
    label: string;
    onClick: (() => void) | (() => Promise<void>);
    buttonProps?: ButtonProps;
    /**
     * @default true
     */
    autoClose?: boolean;
  };

  // custom slots
  thumb?: ReactNode;
  title?: ReactNode;
  message?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;

  // events
  onDismiss?: () => void;
}

export interface NotificationCenterProps {
  width?: number;
}

export interface NotificationCustomRendererProps {
  onDismiss?: () => void;
}
