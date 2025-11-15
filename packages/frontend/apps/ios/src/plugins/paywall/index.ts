import { registerPlugin } from '@capacitor/core';

import type { PayWallPlugin } from './definitions';

const PayWall = registerPlugin<PayWallPlugin>('PayWall');

export * from './definitions';
export { PayWall };
