import type { DeltaInsert } from '@blocksuite/affine/store';

export function getTextElementText(
  elementModel: Record<string, unknown>
): string {
  let text = '';
  if (elementModel.type !== 'text') {
    return text;
  }
  if (
    'text' in elementModel &&
    typeof elementModel.text === 'object' &&
    elementModel.text
  ) {
    let delta: DeltaInsert[] = [];
    if ('delta' in elementModel.text) {
      delta = elementModel.text.delta as DeltaInsert[];
    }
    text = delta.map(d => d.insert).join('');
  }
  return text;
}
