import { getShapeName, type ShapeProps } from '@blocksuite/affine-model';
import type {
  LastProps,
  LastPropsKey,
} from '@blocksuite/affine-shared/services';
import { NodePropsSchema } from '@blocksuite/affine-shared/utils';

const LastPropsSchema = NodePropsSchema;

export function getLastPropsKey(
  modelType: string,
  modelProps: Partial<LastProps[LastPropsKey]>
): LastPropsKey | null {
  if (modelType === 'shape') {
    const { shapeType, radius } = modelProps as ShapeProps;
    const shapeName = getShapeName(shapeType, radius);
    return `${modelType}:${shapeName}`;
  }

  if (isLastPropsKey(modelType)) {
    return modelType;
  }

  return null;
}

function isLastPropsKey(key: string): key is LastPropsKey {
  return Object.keys(LastPropsSchema.shape).includes(key);
}
