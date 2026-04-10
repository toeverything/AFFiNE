import { registerPlugin } from '@capacitor/core';

import type { PreviewPlugin } from './definitions';

const Preview = registerPlugin<PreviewPlugin>('Preview');

export * from './definitions';
export { Preview };
