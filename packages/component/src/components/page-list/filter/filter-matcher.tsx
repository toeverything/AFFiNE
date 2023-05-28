import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import type { Filter } from './ast';
import { tBoolean, tDate } from './logical/custom-type';
import { Matcher } from './logical/matcher';
import type { TFunction } from './logical/typesystem';
import { tFunction, typesystem } from './logical/typesystem';

export const filterMatcher = new Matcher<
  {
    name: string;
    defaultArgs: () => unknown[];
    render?: (props: { ast: Filter }) => ReactNode;
    impl: (...args: unknown[]) => boolean;
  },
  TFunction
>((type, target) => {
  const staticType = typesystem.subst(
    Object.fromEntries(type.typeVars?.map(v => [v.name, v.bound]) ?? []),
    type
  );
  const firstArg = staticType.args[0];
  return firstArg && typesystem.isSubtype(firstArg, target);
});

filterMatcher.register(
  tFunction({
    args: [tBoolean.create(), tBoolean.create()],
    rt: tBoolean.create(),
  }),
  {
    name: 'is',
    defaultArgs: () => [true],
    impl: (value, target) => {
      return value == target;
    },
  }
);

filterMatcher.register(
  tFunction({ args: [tDate.create(), tDate.create()], rt: tBoolean.create() }),
  {
    name: 'after',
    defaultArgs: () => {
      return [dayjs().subtract(1, 'day').endOf('day')];
    },
    impl: (date, target) => {
      if (typeof date !== 'number' || !dayjs.isDayjs(target)) {
        throw new Error('argument type error');
      }
      return dayjs(date).isAfter(target.endOf('day'));
    },
  }
);

filterMatcher.register(
  tFunction({ args: [tDate.create(), tDate.create()], rt: tBoolean.create() }),
  {
    name: 'before',
    defaultArgs: () => [dayjs().endOf('day')],
    impl: (date, target) => {
      if (typeof date !== 'number' || !dayjs.isDayjs(target)) {
        throw new Error('argument type error');
      }
      return dayjs(date).isBefore(target.startOf('day'));
    },
  }
);
