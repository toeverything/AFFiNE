export interface PickedImageFile {
  path: string;
  name: string;
  mimeType: string;
  lastModified: number;
}

export interface ImagePickerPlugin {
  pickImages(options?: { multiple?: boolean }): Promise<{
    files: PickedImageFile[];
    canceled?: boolean;
  }>;
}
