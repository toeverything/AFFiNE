import type {
  ButtonProps,
  MenuSubProps,
  RowInputProps,
} from '@affine/component';
import type { PropsWithChildren, ReactNode } from 'react';

export interface RenameBaseProps {
  initialName?: string;
  onConfirm?: (name: string) => void;
}

export interface RenameContentProps extends RenameBaseProps {
  inputProps?: Omit<RowInputProps, 'value' | 'onChange'>;
  confirmButtonProps?: Omit<ButtonProps, 'onClick' | 'children'>;
  confirmText?: string;
  inputPrefixRenderer?: (props: { input: string }) => ReactNode;
  descRenderer?: (props: { input: string }) => ReactNode;
  inputBelowRenderer?: (props: { input: string }) => ReactNode;
}

export interface RenameSubMenuProps
  extends PropsWithChildren<RenameContentProps> {
  /** Submenu's title */
  title?: string;
  /** MenuItem.icon */
  icon?: ReactNode;
  /** MenuItem.text */
  text?: string;
  menuProps?: Partial<MenuSubProps>;
  disabled?: boolean;
}

export interface RenameDialogProps
  extends PropsWithChildren<RenameContentProps> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
}
