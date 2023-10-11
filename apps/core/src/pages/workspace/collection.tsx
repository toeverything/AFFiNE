import { currentCollectionAtom } from '@affine/component/page-list';
import { getCurrentStore } from '@toeverything/infra/atom';
import { type LoaderFunction, redirect } from 'react-router-dom';

import { collectionsCRUDAtom } from '../../atoms/collections';
import { AllPage } from './all-page';

export const loader: LoaderFunction = args => {
  const rootStore = getCurrentStore();
  const { collections } = rootStore.get(collectionsCRUDAtom);
  const collection = collections.find(v => v.id === args.params.collectionId);
  if (!collection) {
    return redirect('/404');
  }
  rootStore.set(currentCollectionAtom, collection.id);
  return null;
};

export const Component = () => {
  return <AllPage />;
};
