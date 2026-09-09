import { registerPlugin } from '@capacitor/core';

import type { PencilInputPlugin } from './definitions';

const PencilInput = registerPlugin<PencilInputPlugin>('PencilInput');

export * from './definitions';
export { PencilInput };
