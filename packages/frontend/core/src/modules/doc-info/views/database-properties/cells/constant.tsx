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
import { MultiSelectCell, SelectCell } from './select';

export const DatabaseRendererTypes = {
  'rich-text': {
    Icon: TextIcon,
    Renderer: RichTextCell,
    name: 'com.affine.page-properties.property.text',
  },
  checkbox: {
    Icon: CheckBoxCheckLinearIcon,
    Renderer: CheckboxCell,
    name: 'com.affine.page-properties.property.checkbox',
  },
  date: {
    Icon: DateTimeIcon,
    Renderer: DateCell,
    name: 'com.affine.page-properties.property.date',
  },
  number: {
    Icon: NumberIcon,
    Renderer: NumberCell,
    name: 'com.affine.page-properties.property.number',
  },
  link: {
    Icon: LinkIcon,
    Renderer: LinkCell,
    name: 'com.affine.page-properties.property.link',
  },
  progress: {
    Icon: ProgressIcon,
    Renderer: NumberCell,
    name: 'com.affine.page-properties.property.progress',
  },
  select: {
    Icon: SelectIcon,
    Renderer: SelectCell,
    name: 'com.affine.page-properties.property.select',
  },
  'multi-select': {
    Icon: SelectIcon,
    Renderer: MultiSelectCell,
    name: 'com.affine.page-properties.property.multi-select',
  },
} as Record<
  string,
  {
    Icon: React.FC<React.SVGProps<SVGSVGElement>>;
    Renderer: React.FC<DatabaseCellRendererProps>;
    name: I18nString;
  }
>;

export const isSupportedDatabaseRendererType = (type?: string): boolean => {
  return type ? type in DatabaseRendererTypes : false;
};
