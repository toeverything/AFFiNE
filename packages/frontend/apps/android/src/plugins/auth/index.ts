import { registerPlugin } from '@capacitor/core';

import type { AuthPlugin } from './definitions';

const Auth = registerPlugin<AuthPlugin>('Auth');

export * from './definitions';
export { Auth };
