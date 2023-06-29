/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type {
  Filter,
  LiteralValue,
  Ref,
  VariableMap,
} from '@affine/env/filter';
import { createI18n, I18nextProvider } from '@affine/i18n';
import { assertExists } from '@blocksuite/global/utils';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';

import { Condition } from '../filter/condition';
import { tBoolean, tDate } from '../filter/logical/custom-type';
import { toLiteral } from '../filter/shared-types';
import type { FilterMatcherDataType } from '../filter/vars';
import { filterMatcher } from '../filter/vars';
import { filterByFilterList } from '../use-all-page-setting';
const ref = (name: keyof VariableMap): Ref => {
  return {
    type: 'ref',
    name,
  };
};
const mockVariableMap = (vars: Partial<VariableMap>): VariableMap => {
  return {
    Created: 0,
    Updated: 0,
    'Is Favourited': false,
    ...vars,
  };
};
const filter = (
  matcherData: FilterMatcherDataType,
  left: Ref,
  args: LiteralValue[]
): Filter => {
  return {
    type: 'filter',
    left,
    funcName: matcherData.name,
    args: args.map(toLiteral),
  };
};
describe('match filter', () => {
  test('boolean variable will match `is` filter', () => {
    const is = filterMatcher
      .allMatchedData(tBoolean.create())
      .find(v => v.name === 'is');
    expect(is?.name).toBe('is');
  });
  test('Date variable will match `before` filter', () => {
    const before = filterMatcher
      .allMatchedData(tDate.create())
      .find(v => v.name === 'before');
    expect(before?.name).toBe('before');
  });
});

describe('eval filter', () => {
  test('before', async () => {
    const before = filterMatcher.findData(v => v.name === 'before');
    assertExists(before);
    const filter1 = filter(before, ref('Created'), [
      new Date(2023, 5, 28).getTime(),
    ]);
    const filter2 = filter(before, ref('Created'), [
      new Date(2023, 5, 30).getTime(),
    ]);
    const filter3 = filter(before, ref('Created'), [
      new Date(2023, 5, 29).getTime(),
    ]);
    const varMap = mockVariableMap({
      Created: new Date(2023, 5, 29).getTime(),
    });
    expect(filterByFilterList([filter1], varMap)).toBe(false);
    expect(filterByFilterList([filter2], varMap)).toBe(true);
    expect(filterByFilterList([filter3], varMap)).toBe(false);
  });
  test('after', async () => {
    const after = filterMatcher.findData(v => v.name === 'after');
    assertExists(after);
    const filter1 = filter(after, ref('Created'), [
      new Date(2023, 5, 28).getTime(),
    ]);
    const filter2 = filter(after, ref('Created'), [
      new Date(2023, 5, 30).getTime(),
    ]);
    const filter3 = filter(after, ref('Created'), [
      new Date(2023, 5, 29).getTime(),
    ]);
    const varMap = mockVariableMap({
      Created: new Date(2023, 5, 29).getTime(),
    });
    expect(filterByFilterList([filter1], varMap)).toBe(true);
    expect(filterByFilterList([filter2], varMap)).toBe(false);
    expect(filterByFilterList([filter3], varMap)).toBe(false);
  });
  test('is', async () => {
    const is = filterMatcher.findData(v => v.name === 'is');
    assertExists(is);
    const filter1 = filter(is, ref('Is Favourited'), [false]);
    const filter2 = filter(is, ref('Is Favourited'), [true]);
    const varMap = mockVariableMap({
      'Is Favourited': true,
    });
    expect(filterByFilterList([filter1], varMap)).toBe(false);
    expect(filterByFilterList([filter2], varMap)).toBe(true);
  });
});

describe('render filter', () => {
  test('boolean condition value change', async () => {
    const i18n = createI18n();
    const is = filterMatcher.match(tBoolean.create());
    assertExists(is);
    const Wrapper = () => {
      const [value, onChange] = useState(
        filter(is, ref('Is Favourited'), [true])
      );

      return (
        <I18nextProvider i18n={i18n}>
          <Condition value={value} onChange={onChange} />
        </I18nextProvider>
      );
    };
    const result = render(<Wrapper />);
    const dom = await result.findByText('true');
    dom.click();
    await result.findByText('false');
    result.unmount();
  });

  const WrapperCreator = (fn: FilterMatcherDataType) =>
    function Wrapper(): ReactElement {
      const [value, onChange] = useState(
        filter(fn, ref('Created'), [new Date(2023, 5, 29).getTime()])
      );
      return <Condition value={value} onChange={onChange} />;
    };

  test('date condition function change', async () => {
    const dateFunction = filterMatcher.match(tDate.create());
    assertExists(dateFunction);
    const Wrapper = WrapperCreator(dateFunction);
    const result = render(<Wrapper />);
    const dom = await result.findByTestId('filter-name');
    dom.click();
    await result.findByTestId('filter-name');
    result.unmount();
  });
  test('date condition variable change', async () => {
    const dateFunction = filterMatcher.match(tDate.create());
    assertExists(dateFunction);
    const Wrapper = WrapperCreator(dateFunction);
    const result = render(<Wrapper />);
    const dom = await result.findByTestId('variable-name');
    dom.click();
    await result.findByTestId('variable-name');
    result.unmount();
  });
});
