import { registerAICustomComponents } from '@affine/core/blocksuite/presets/ai';
import { effects as blocksEffects } from '@blocksuite/blocks/effects';
import { effects as presetsEffects } from '@blocksuite/presets/effects';

import { setupAIProvider } from './ai/setup-provider';
import { effects as edgelessEffects } from './specs/edgeless';
import { effects as patchEffects } from './specs/preview';

blocksEffects();
presetsEffects();
patchEffects();
setupAIProvider();
edgelessEffects();
registerAICustomComponents();

export * from './blocksuite-editor';
