import { describe, expect, it } from 'vitest';

import { groupByMatchers } from '../core/group-by/define.js';
import { t } from '../core/logical/type-presets.js';

describe('groupBy define', () => {
  it('boolean group should not include ungroup bucket', () => {
    const booleanGroup = groupByMatchers.find(
      group => group.name === 'boolean'
    );
    expect(booleanGroup).toBeDefined();

    const keys = booleanGroup!
      .defaultKeys(t.boolean.instance())
      .map(group => group.key);

    expect(keys).toEqual(['true', 'false']);
  });

  it('boolean group should fallback invalid values to false bucket', () => {
    const booleanGroup = groupByMatchers.find(
      group => group.name === 'boolean'
    );
    expect(booleanGroup).toBeDefined();

    const groups = booleanGroup!.valuesGroup(undefined, t.boolean.instance());
    expect(groups).toEqual([{ key: 'false', value: false }]);
  });
});
