import { currentCollectionAtom } from '@affine/component/page-list';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';
import { type LoaderFunction, redirect, useParams } from 'react-router-dom';

import { pageCollectionBaseAtom } from '../../atoms/collections';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { AllPage } from './all-page';

export const loader: LoaderFunction = async args => {
  const rootStore = getCurrentStore();
  if (!args.params.collectionId) {
    return redirect('/404');
  }
  rootStore.set(currentCollectionAtom, args.params.collectionId);
  return null;
};

export const Component = function CollectionPage() {
  const { collections, loading } = useAtomValue(pageCollectionBaseAtom);
  const navigate = useNavigateHelper();
  const params = useParams();
  if (loading) {
    return null;
  }
  const collection = collections.find(v => v.id === params.collectionId);
  if (!collection) {
    navigate.jumpTo404();
    return null;
  }
  return <AllPage />;
};
