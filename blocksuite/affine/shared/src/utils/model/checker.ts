import type { BlockModel, Store } from '@blocksuite/store';

type ConstructorType<U> = { new (): U };
type ModelList<T> =
  T extends Array<infer U>
    ? U extends ConstructorType<infer C>
      ? Array<C>
      : never
    : never;

export function matchModels<
  const Model extends ConstructorType<BlockModel>[],
  U extends ModelList<Model>[number] = ModelList<Model>[number],
>(model: BlockModel | null | undefined, expected: Model): model is U {
  if (model === null || model === undefined) {
    return false;
  }
  return expected.some(expectedModel => model instanceof expectedModel);
}

export function isInsideBlockByFlavour(
  doc: Store,
  block: BlockModel | string,
  flavour: string
): boolean {
  const parent = doc.getParent(block);
  if (parent === null) {
    return false;
  }
  if (flavour === parent.flavour) {
    return true;
  }
  return isInsideBlockByFlavour(doc, parent, flavour);
}
