import type { Collection } from '@affine/env/filter';

import { DetailHeader } from './detail';

export const EmptyCollection = ({ collection }: { collection: Collection }) => {
  return (
    <>
      <DetailHeader collection={collection} />
      Empty
    </>
  );
};
