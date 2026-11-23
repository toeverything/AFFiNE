import type { UserFriendlyError } from '@affine/error';
import type { HTMLAttributes, ReactNode } from 'react';

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
  actions?: {
    key: string;
    label: ReactNode;
    onClick: (() => void) | (() => Promise<void>);
    buttonProps?: ButtonProps;
    /**
     * @default true
     */
    autoClose?: boolean;
  }[];

  rootAttrs?: HTMLAttributes<HTMLDivElement>;

  // custom slots
  thumb?: ReactNode;
  title?: ReactNode;
  message?: ReactNode;
  error?: UserFriendlyError;
  icon?: ReactNode;
  iconColor?: string;

  // events
  onDismiss?: () => void;
}

export interface NotificationCenterProps {
  width?: number;
}

export interface NotificationCustomRendererProps {
  onDismiss?: () => void;
}

export interface NotificationCardProps extends HTMLAttributes<HTMLDivElement> {
  notification: Notification;
}

export interface NotificationActionProps {
  action: NonNullable<Notification['actions']>[number];
  onDismiss: Notification['onDismiss'];
}
