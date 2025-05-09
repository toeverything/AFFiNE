import { registerPlugin } from '@capacitor/core';

import type { AffineThemePlugin } from './definitions';

const AffineTheme = registerPlugin<AffineThemePlugin>('AffineTheme');

export * from './definitions';
export { AffineTheme };
