import { registerAIEffects } from '@affine/core/blocksuite/ai/effects';
import { editorEffects } from '@affine/core/blocksuite/editors';

import { registerTemplates } from './register-templates';

editorEffects();
registerAIEffects();
registerTemplates();

export * from './blocksuite-editor';
