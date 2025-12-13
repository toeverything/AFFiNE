import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';

import { getRefType } from '../expression/ref/ref.js';
import type { Value, Variable, VariableRef } from '../expression/types.js';
import { filterMatcher } from './filter-fn/matcher.js';
import type { FilterGroup, SingleFilter } from './types.js';

const getDefaultArgsForFilter = (filterName?: string): Value[] => {
  if (!filterName) return [];

  const filterConfig = filterMatcher.getFilterByName(filterName);
  if (!filterConfig) return [];

  // Initialize args based on filter type
  return filterConfig.args.map(argType => {
    // TypeInstance has 'name' property, not 'type'
    const typeName = (argType as { name?: string }).name;

    // Date type - default to today
    if (typeName === 'Date') {
      return { type: 'literal' as const, value: Date.now() };
    }

    // RelativeDate type - default to ['this', 'day']
    if (typeName === 'RelativeDate') {
      return { type: 'literal' as const, value: ['this', 'day'] as const };
    }

    // For other types, return undefined value
    return { type: 'literal' as const, value: undefined };
  });
};

export const firstFilterName = (vars: Variable[], ref: VariableRef) => {
  const type = getRefType(vars, ref);
  if (!type) {
    throw new BlockSuiteError(
      ErrorCode.DatabaseBlockError,
      `can't resolve ref type`
    );
  }
  return filterMatcher.firstMatchedBySelfType(type)?.name;
};
export const firstFilterByRef = (
  vars: Variable[],
  ref: VariableRef
): SingleFilter => {
  const filterName = firstFilterName(vars, ref);
  return {
    type: 'filter',
    left: ref,
    function: filterName,
    args: getDefaultArgsForFilter(filterName),
  };
};
export const firstFilter = (vars: Variable[]): SingleFilter => {
  const variable = vars[0];
  if (!variable) {
    throw new BlockSuiteError(
      ErrorCode.DatabaseBlockError,
      `can't find any variable`
    );
  }
  const ref: VariableRef = {
    type: 'ref',
    name: variable.id,
  };
  const filterName = firstFilterName(vars, ref);
  if (!filterName) {
    throw new BlockSuiteError(
      ErrorCode.DatabaseBlockError,
      `can't match any filter`
    );
  }
  return {
    type: 'filter',
    left: ref,
    function: filterName,
    args: getDefaultArgsForFilter(filterName),
  };
};
export const firstFilterInGroup = (vars: Variable[]): FilterGroup => {
  return {
    type: 'group',
    op: 'and',
    conditions: [firstFilter(vars)],
  };
};
export const emptyFilterGroup: FilterGroup = {
  type: 'group',
  op: 'and',
  conditions: [],
};
