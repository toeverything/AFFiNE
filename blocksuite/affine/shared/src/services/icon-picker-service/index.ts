import type { UniComponent } from '@blocksuite/affine-shared/types';
import { createIdentifier } from '@blocksuite/global/di';
import type { TemplateResult } from 'lit';
export enum IconType {
  Emoji = 'emoji',
  AffineIcon = 'affine-icon',
  Blob = 'blob',
}

export type IconData =
  | {
      type: IconType.Emoji;
      unicode: string;
    }
  | {
      type: IconType.AffineIcon;
      name: string;
      color: string;
    }
  | {
      type: IconType.Blob;
      blob: Blob;
    };

export interface IconPickerOptions {
  onSelect?: (icon: IconData) => void;
  onClose?: () => void;
  currentIcon?: IconData;
}

export interface IconPickerService {
  iconPickerComponent: UniComponent<{ onSelect?: (data?: IconData) => void }>;
  renderIconPicker(options: IconPickerOptions): TemplateResult;
}

export const IconPickerServiceIdentifier =
  createIdentifier<IconPickerService>('IconPickerService');
