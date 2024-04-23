import type { ReactNode } from 'react';

import type { ModalProps } from '../modal';

export interface DialogOptions extends Omit<ModalProps, 'open'> {
  component: ReactNode;
  /**
   * Unique identifier for the dialog.
   * If specified, the dialog will be reused
   */
  id?: string;
}

export interface Dialog extends DialogOptions {
  id: string;
  open: boolean;
}
