export * from './blocksuite-editor';
export { getFontConfigExtension } from './specs/font-extension';

import { effects as blocksEffects } from '@blocksuite/blocks/effects';
import { effects as presetsEffects } from '@blocksuite/presets/effects';

import { setupAIProvider } from './ai/setup-provider';
import { effects as patchEffects } from './specs/preview';

blocksEffects();
presetsEffects();
patchEffects();
setupAIProvider();
