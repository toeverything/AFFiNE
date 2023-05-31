import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import { tBoolean, tDate } from './logical/custom-type';
import { Matcher } from './logical/matcher';
import type { TType } from './logical/typesystem';
import { typesystem } from './logical/typesystem';
import type { Literal } from './vars';

export const literalMatcher = new Matcher<{
  render: (props: {
    type: TType;
    value: Literal;
    onChange: (lit: Literal) => void;
  }) => ReactNode;
}>((type, target) => {
  return typesystem.isSubtype(type, target);
});

literalMatcher.register(tBoolean.create(), {
  render: ({ value, onChange }) => (
    <div
      style={{ cursor: 'pointer' }}
      onClick={() => {
        onChange({ type: 'literal', value: !value.value });
      }}
    >
      {value.value?.toString()}
    </div>
  ),
});
literalMatcher.register(tDate.create(), {
  render: ({ value, onChange }) => (
    <input
      value={dayjs(value.value as number).format('YYYY-MM-DD')}
      type="date"
      onChange={e => {
        onChange({
          type: 'literal',
          value: dayjs(e.target.value, 'YYYY-MM-DD').valueOf(),
        });
      }}
    />
  ),
});
