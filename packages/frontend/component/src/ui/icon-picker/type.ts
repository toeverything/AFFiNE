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
