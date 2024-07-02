import type { I18nString } from '@affine/i18n';

import type { QuickSearchGroup } from './group';

export type QuickSearchItem<S = any, P = any> = {
  id: string;
  source: S;
  label:
    | I18nString
    | {
        title: I18nString;
        subTitle?: I18nString;
      };
  score?: number;
  icon?: React.ReactNode | React.ComponentType;
  group?: QuickSearchGroup;
  disabled?: boolean;
  keyBinding?: string;
  timestamp?: number;
  payload?: P;
} & (P extends NonNullable<unknown> ? { payload: P } : unknown);
