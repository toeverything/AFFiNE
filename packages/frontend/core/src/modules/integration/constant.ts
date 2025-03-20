import type { I18nString } from '@affine/i18n';
import { ReadwiseLogoDuotoneIcon } from '@blocksuite/icons/rc';
import type { SVGProps } from 'react';

import type { IntegrationProperty, IntegrationType } from './type';

// name
export const INTEGRATION_TYPE_NAME_MAP: Record<IntegrationType, I18nString> = {
  readwise: 'com.affine.integration.name.readwise',
  zotero: 'Zotero',
};

// schema
export const INTEGRATION_PROPERTY_SCHEMA: {
  [T in IntegrationType]: Record<string, IntegrationProperty<T>>;
} = {
  readwise: {
    author: {
      label: 'com.affine.integration.readwise-prop.author',
      key: 'author',
      type: 'text',
    },
    source: {
      label: 'com.affine.integration.readwise-prop.source',
      key: 'readwise_url',
      type: 'source',
    },
  },
  zotero: {},
};

// icon
export const INTEGRATION_ICON_MAP: Record<
  IntegrationType,
  React.ComponentType<SVGProps<SVGSVGElement>>
> = {
  readwise: ReadwiseLogoDuotoneIcon,
  zotero: () => null,
};
