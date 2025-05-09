import { registerPlugin } from '@capacitor/core';

import type { AIButtonPlugin } from './definitions';

const AIButton = registerPlugin<AIButtonPlugin>('AIButton');

export * from './definitions';
export { AIButton };
