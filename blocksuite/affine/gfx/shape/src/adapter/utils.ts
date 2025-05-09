import type { DeltaInsert } from '@blocksuite/store';

export function getShapeType(elementModel: Record<string, unknown>): string {
  let shapeType = '';
  if (elementModel.type !== 'shape') {
    return shapeType;
  }

  if (
    'shapeType' in elementModel &&
    typeof elementModel.shapeType === 'string'
  ) {
    shapeType = elementModel.shapeType;
  }
  return shapeType;
}

export function getShapeText(elementModel: Record<string, unknown>): string {
  let text = '';
  if (elementModel.type !== 'shape') {
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
