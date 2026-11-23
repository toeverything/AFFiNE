import { registerAIEditorEffects } from '@affine/core/blocksuite/ai/effects/editor';
import { editorEffects } from '@affine/core/blocksuite/editors';

import { registerTemplates } from './register-templates';

editorEffects();
registerAIEditorEffects();
registerTemplates();

export * from './blocksuite-editor';
