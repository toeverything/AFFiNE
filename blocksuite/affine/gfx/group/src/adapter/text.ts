import type { DeltaInsert } from '@blocksuite/affine/store';

export function getGroupTitle(elementModel: Record<string, unknown>): string {
  let title = '';
  if (elementModel.type !== 'group') {
    return title;
  }

  if (
    'title' in elementModel &&
    typeof elementModel.title === 'object' &&
    elementModel.title
  ) {
    let delta: DeltaInsert[] = [];
    if ('delta' in elementModel.title) {
      delta = elementModel.title.delta as DeltaInsert[];
    }
    title = delta.map(d => d.insert).join('');
  }
  return title;
}
