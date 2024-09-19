import { registerAICustomComponents } from '@affine/core/blocksuite/presets/ai';
import { effects } from '@blocksuite/affine/effects';

import { setupAIProvider } from './ai/setup-provider';
import { effects as edgelessEffects } from './specs/edgeless';
import { effects as patchEffects } from './specs/preview';

effects();
patchEffects();
setupAIProvider();
edgelessEffects();
registerAICustomComponents();

export * from './blocksuite-editor';
