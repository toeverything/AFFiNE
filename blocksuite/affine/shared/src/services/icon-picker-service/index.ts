import type { UniComponent } from '@blocksuite/affine-shared/types';
import { createIdentifier } from '@blocksuite/global/di';
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
      /** key of the image stored in the workspace blob engine */
      blobId: string;
    };

export interface IconPickerService {
  iconPickerComponent: UniComponent<{
    onSelect?: (data?: IconData | Blob) => void;
  }>;
}

export const IconPickerServiceIdentifier =
  createIdentifier<IconPickerService>('IconPickerService');
