type DateFilters =
  | 'after'
  | 'before'
  | 'between'
  | 'last-3-days'
  | 'last-7-days'
  | 'last-15-days'
  | 'last-30-days'
  | 'this-month'
  | 'this-week'
  | 'this-quarter'
  | 'this-year'
  | 'last-30-minutes'
  | 'last-1-hour'
  | 'last-3-hours'
  | 'last-6-hours'
  | 'last-12-hours'
  | 'last-24-hours';
// NOTE: last-60-minutes and last-180-minutes were removed — they were exact
// aliases of last-1-hour and last-3-hours respectively, producing duplicate
// entries in the filter method dropdown.

export type WorkspacePropertyTypes = {
  tags: {
    filter:
      | 'include-all'
      | 'include-any-of'
      | 'not-include-all'
      | 'not-include-any-of'
      | 'is-not-empty'
      | 'is-empty';
  };
  text: {
    filter: 'is' | 'is-not' | 'is-not-empty' | 'is-empty';
  };
  number: {
    filter: '=' | '≠' | '>' | '<' | '≥' | '≤' | 'is-not-empty' | 'is-empty';
  };
  checkbox: {
    filter: 'is' | 'is-not';
  };
  date: {
    filter: DateFilters | 'is-not-empty' | 'is-empty';
  };
  createdBy: { filter: 'include' };
  updatedBy: { filter: 'include' };
  updatedAt: { filter: DateFilters };
  createdAt: { filter: DateFilters };
  docPrimaryMode: { filter: 'is' | 'is-not' };
  journal: { filter: 'is' | 'is-not' };
  edgelessTheme: { filter: 'is' | 'is-not' };
  pageWidth: { filter: 'is' | 'is-not' };
  template: { filter: 'is' | 'is-not' };
  unknown: { filter: never };
};
export type WorkspacePropertyType = keyof WorkspacePropertyTypes;

export type WorkspacePropertyFilter<T extends WorkspacePropertyType> =
  WorkspacePropertyTypes[T]['filter'];
