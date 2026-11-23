import { registerPlugin } from '@capacitor/core';

import type { HashCashPlugin } from './definitions';

const HashCash = registerPlugin<HashCashPlugin>('HashCash');

export * from './definitions';
export { HashCash };
