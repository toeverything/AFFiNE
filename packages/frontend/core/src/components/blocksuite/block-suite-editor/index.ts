import { registerBlocksuitePresetsCustomComponents } from '@affine/core/blocksuite/presets/effects';
import { effects as bsEffects } from '@blocksuite/affine/effects';

import { setupAIProvider } from './ai/setup-provider';
import { effects as edgelessEffects } from './specs/edgeless';
import { effects as patchEffects } from './specs/preview';

bsEffects();
patchEffects();
setupAIProvider();
edgelessEffects();
registerBlocksuitePresetsCustomComponents();

export * from './blocksuite-editor';
