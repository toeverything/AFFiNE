import type { I18nString } from '@affine/i18n';
import {
  CheckBoxCheckLinearIcon,
  DateTimeIcon,
  LinkIcon,
  NumberIcon,
  ProgressIcon,
  SelectIcon,
  TextIcon,
} from '@blocksuite/icons/rc';

import type { DatabaseCellRendererProps } from '../../../types';
import { CheckboxCell } from './checkbox';
import { DateCell } from './date';
import { LinkCell } from './link';
import { NumberCell } from './number';
import { RichTextCell } from './rich-text';

export const DatabaseRendererTypes = {
  'rich-text': {
    icon: TextIcon,
    Renderer: RichTextCell,
    name: 'com.affine.page-properties.property.text',
  },
  checkbox: {
    icon: CheckBoxCheckLinearIcon,
    Renderer: CheckboxCell,
    name: 'com.affine.page-properties.property.checkbox',
  },
  date: {
    icon: DateTimeIcon,
    Renderer: DateCell,
    name: 'com.affine.page-properties.property.date',
  },
  number: {
    icon: NumberIcon,
    Renderer: NumberCell,
    name: 'com.affine.page-properties.property.number',
  },
  link: {
    icon: LinkIcon,
    Renderer: LinkCell,
    name: 'com.affine.page-properties.property.link',
  },
  progress: {
    icon: ProgressIcon,
    Renderer: NumberCell,
    name: 'com.affine.page-properties.property.progress',
  },
  select: {
    icon: SelectIcon,
    Renderer: ({ cell }) => {
      return cell.value.toString();
    },
    name: 'com.affine.page-properties.property.select',
  },
  'multi-select': {
    icon: SelectIcon,
    Renderer: ({ cell }) => {
      return cell.value.toString();
    },
    name: 'com.affine.page-properties.property.multi-select',
  },
} as Record<
  string,
  {
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    Renderer: React.FC<DatabaseCellRendererProps>;
    name: I18nString;
  }
>;

export const isSupportedDatabaseRendererType = (type?: string): boolean => {
  return type ? type in DatabaseRendererTypes : false;
};
