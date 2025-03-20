import type { TemplateResult } from 'lit';

export type MenuItem<T> = {
  key?: string;
  value: T;
  icon?: TemplateResult;
  disabled?: boolean;
};

export type Menu<T> = {
  label: string;
  icon?: TemplateResult;
  tooltip?: string;
  items: MenuItem<T>[];
  currentValue: T;
  onPick: (value: T) => void;
};
