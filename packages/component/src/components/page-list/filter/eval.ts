import type { Filter, Literal, Ref } from './vars';
import type { VariableMap } from './vars';
import { filterMatcher } from './vars';

const evalRef = (ref: Ref, variableMap: VariableMap) => {
  return variableMap[ref.name];
};
const evalLiteral = (lit: Literal) => {
  return lit.value;
};
const evalFilter = (filter: Filter, variableMap: VariableMap): boolean => {
  const impl = filterMatcher.findData(v => v.name === filter.funcName)?.impl;
  if (!impl) {
    throw new Error('No function implementation found');
  }
  const leftValue = evalRef(filter.left, variableMap);
  const args = filter.args.map(evalLiteral);
  return impl(leftValue, ...args);
};
export const evalFilterList = (
  filterList: Filter[],
  variableMap: VariableMap
) => {
  return filterList.every(filter => evalFilter(filter, variableMap));
};
