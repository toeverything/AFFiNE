import type { I18nString } from '@affine/i18n';
import {
  DateTimeIcon,
  HistoryIcon,
  LinkIcon,
  ReadwiseLogoDuotoneIcon,
  TextIcon,
} from '@blocksuite/icons/rc';
import type { SVGProps } from 'react';

import type { IntegrationProperty, IntegrationType } from './type';

// name
export const INTEGRATION_TYPE_NAME_MAP: Record<IntegrationType, I18nString> = {
  readwise: 'com.affine.integration.name.readwise',
  // zotero: 'Zotero',
};

// schema
export const INTEGRATION_PROPERTY_SCHEMA: {
  [T in IntegrationType]: Record<string, IntegrationProperty<T>>;
} = {
  readwise: {
    author: {
      order: '400',
      label: 'com.affine.integration.readwise-prop.author',
      key: 'author',
      type: 'text',
      icon: TextIcon,
    },
    source: {
      order: '300',
      label: 'com.affine.integration.readwise-prop.source',
      key: 'readwise_url',
      type: 'source',
      icon: LinkIcon,
    },
    created: {
      order: '100',
      label: 'com.affine.integration.readwise-prop.created',
      key: 'created_at',
      type: 'date',
      icon: DateTimeIcon,
    },
    updated: {
      order: '200',
      label: 'com.affine.integration.readwise-prop.updated',
      key: 'updated_at',
      type: 'date',
      icon: HistoryIcon,
    },
  },
  // zotero: {},
};

// icon
export const INTEGRATION_ICON_MAP: Record<
  IntegrationType,
  React.ComponentType<SVGProps<SVGSVGElement>>
> = {
  readwise: ReadwiseLogoDuotoneIcon,
  // zotero: () => null,
};
