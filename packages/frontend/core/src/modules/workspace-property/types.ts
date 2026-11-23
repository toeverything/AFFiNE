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
  | 'this-year';

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
