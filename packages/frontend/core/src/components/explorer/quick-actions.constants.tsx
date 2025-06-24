import type { I18nString } from '@affine/i18n';

import {
  type QuickActionProps,
  QuickDelete,
  QuickDeletePermanently,
  QuickFavorite,
  QuickRestore,
  QuickSelect,
  QuickSplit,
  QuickTab,
} from './docs-view/quick-actions';
import type { ExplorerDisplayPreference } from './types';

interface QuickActionItem {
  name: I18nString;
  Component: React.FC<QuickActionProps>;
  disabled?: boolean;
}

type ExtractPrefixKeys<Obj extends object, Prefix extends string> = {
  [Key in keyof Obj]-?: Key extends `${Prefix}${string}` ? Key : never;
}[keyof Obj];

export type QuickActionKey = ExtractPrefixKeys<
  ExplorerDisplayPreference,
  'quick'
>;

const QUICK_ACTION_MAP: Record<QuickActionKey, QuickActionItem> = {
  quickFavorite: {
    name: 'com.affine.all-docs.quick-action.favorite',
    Component: QuickFavorite,
  },
  quickTrash: {
    name: 'com.affine.all-docs.quick-action.trash',
    Component: QuickDelete,
  },
  quickSplit: {
    name: 'com.affine.all-docs.quick-action.split',
    Component: QuickSplit,
    disabled: !BUILD_CONFIG.isElectron,
  },
  quickTab: {
    name: 'com.affine.all-docs.quick-action.tab',
    Component: QuickTab,
  },
  quickSelect: {
    name: 'com.affine.all-docs.quick-action.select',
    Component: QuickSelect,
  },
  quickDeletePermanently: {
    name: 'com.affine.all-docs.quick-action.delete-permanently',
    Component: QuickDeletePermanently,
    disabled: true, // can only be controlled in code
  },
  quickRestore: {
    name: 'com.affine.all-docs.quick-action.restore',
    Component: QuickRestore,
    disabled: true, // can only be controlled in code
  },
};
export const quickActions = Object.entries(QUICK_ACTION_MAP).map(
  ([key, config]) => {
    return { key: key as QuickActionKey, ...config };
  }
);

export type QuickAction = (typeof quickActions)[number];
