import { CodeBlockSpec } from '@blocksuite/affine/blocks/code';
import { ImageBlockSpec } from '@blocksuite/affine/blocks/image';
import { ParagraphBlockSpec } from '@blocksuite/affine/blocks/paragraph';
import {
  EdgelessRootBlockSpec,
  PageRootBlockSpec,
} from '@blocksuite/affine/blocks/root';
import type { SpecBuilder } from '@blocksuite/affine/shared/utils';
import type { FrameworkProvider } from '@toeverything/infra';

import { AIChatBlockSpec } from '../blocks';
import { AITranscriptionBlockSpec } from '../blocks/ai-chat-block/ai-transcription-block';
import { AICodeBlockSpec } from './ai-code';
import { createAIEdgelessRootBlockSpec } from './ai-edgeless-root';
import { AIImageBlockSpec } from './ai-image';
import { createAIPageRootBlockSpec } from './ai-page-root';
import { AIParagraphBlockSpec } from './ai-paragraph';

export function enableAIExtension(
  specBuilder: SpecBuilder,
  framework: FrameworkProvider,
  enableAI: boolean
) {
  if (!enableAI) {
    return;
  }

  specBuilder.replace(CodeBlockSpec, AICodeBlockSpec);
  specBuilder.replace(ImageBlockSpec, AIImageBlockSpec);
  specBuilder.replace(ParagraphBlockSpec, AIParagraphBlockSpec);

  if (specBuilder.hasAll(EdgelessRootBlockSpec)) {
    const aiEdgeless = createAIEdgelessRootBlockSpec(framework);
    specBuilder.replace(EdgelessRootBlockSpec, aiEdgeless);
  }

  if (specBuilder.hasAll(PageRootBlockSpec)) {
    const aiPage = createAIPageRootBlockSpec(framework);
    specBuilder.replace(PageRootBlockSpec, aiPage);
  }

  specBuilder.extend(AIChatBlockSpec);
  specBuilder.extend(AITranscriptionBlockSpec);
}
