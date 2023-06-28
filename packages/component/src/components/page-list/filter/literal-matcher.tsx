import type { Literal } from '@affine/env/filter';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import { AFFiNEDatePicker } from '../../date-picker';
import { inputStyle } from './index.css';
import { tBoolean, tDate } from './logical/custom-type';
import { Matcher } from './logical/matcher';
import type { TType } from './logical/typesystem';
import { typesystem } from './logical/typesystem';

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
      className={inputStyle}
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
    <AFFiNEDatePicker
      value={dayjs(value.value as number).format('YYYY-MM-DD')}
      onChange={e => {
        onChange({
          type: 'literal',
          value: dayjs(e, 'YYYY-MM-DD').valueOf(),
        });
      }}
    />
  ),
});
