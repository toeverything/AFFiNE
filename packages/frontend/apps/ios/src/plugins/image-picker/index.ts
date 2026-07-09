import { registerPlugin } from '@capacitor/core';

import type { ImagePickerPlugin } from './definitions';

const ImagePicker = registerPlugin<ImagePickerPlugin>('ImagePicker');

export * from './definitions';
export { ImagePicker };
