import type { Tag } from '@affine/env/filter';

import { DataHelper, typesystem } from './typesystem';

export const tNumber = typesystem.defineData(
  DataHelper.create<{ value: number }>('Number')
);
export const tString = typesystem.defineData(
  DataHelper.create<{ value: string }>('String')
);
export const tBoolean = typesystem.defineData(
  DataHelper.create<{ value: boolean }>('Boolean')
);
export const tDate = typesystem.defineData(
  DataHelper.create<{ value: number }>('Date')
);

export const tTag = typesystem.defineData<{ tags: Tag[] }>({
  name: 'Tag',
  supers: [],
});
