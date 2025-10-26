import { isInsidePageEditor } from '@blocksuite/affine/shared/utils';
import type { EditorHost } from '@blocksuite/affine/std';

import type { AIItemGroupConfig } from '../../components/ai-item/types';
import { mergeStreamContent } from '../../utils/stream-objects';
import type { AIActionAnswer } from './type';

export function filterAIItemGroup(
  host: EditorHost,
  configs: AIItemGroupConfig[]
): AIItemGroupConfig[] {
  const editorMode = isInsidePageEditor(host) ? 'page' : 'edgeless';
  return configs
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        item.showWhen
          ? item.showWhen(host.command.chain(), editorMode, host)
          : true
      ),
    }))
    .filter(group => group.items.length > 0);
}

export function mergeAIActionAnswer(answer: AIActionAnswer): string {
  if (answer.streamObjects?.length) {
    return mergeStreamContent(answer.streamObjects);
  }
  return answer.content;
}
