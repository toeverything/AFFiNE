import type { TagMeta } from '../../types';
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

export const tTag = typesystem.defineData<{ tags: TagMeta[] }>({
  name: 'Tag',
  supers: [],
});

export const tDateRange = typesystem.defineData(
  DataHelper.create<{ value: number }>('DateRange')
);
