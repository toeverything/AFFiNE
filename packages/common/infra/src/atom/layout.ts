import type { ExpectedLayout } from '@affine/sdk/entry';
import { atom } from 'jotai';

const contentLayoutBaseAtom = atom<ExpectedLayout>('editor');

type SetStateAction<Value> = Value | ((prev: Value) => Value);
export const contentLayoutAtom = atom<
  ExpectedLayout,
  [SetStateAction<ExpectedLayout>],
  void
>(
  get => get(contentLayoutBaseAtom),
  (_, set, layout) => {
    set(contentLayoutBaseAtom, prev => {
      let setV: (prev: ExpectedLayout) => ExpectedLayout;
      if (typeof layout !== 'function') {
        setV = () => layout;
      } else {
        setV = layout;
      }
      const nextValue = setV(prev);
      if (nextValue === 'editor') {
        return nextValue;
      }
      if (nextValue.first !== 'editor') {
        throw new Error('The first element of the layout should be editor.');
      }
      if (nextValue.splitPercentage && nextValue.splitPercentage < 70) {
        throw new Error('The split percentage should be greater than 70.');
      }
      return nextValue;
    });
  }
);
