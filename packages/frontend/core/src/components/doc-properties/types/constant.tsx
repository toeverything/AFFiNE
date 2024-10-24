import type { I18nString } from '@affine/i18n';
import {
  CheckBoxCheckLinearIcon,
  CreatedEditedIcon,
  DateTimeIcon,
  FileIcon,
  HistoryIcon,
  NumberIcon,
  TagIcon,
  TextIcon,
  TodayIcon,
} from '@blocksuite/icons/rc';

import { CheckboxValue } from './checkbox';
import { CreatedByValue, UpdatedByValue } from './created-updated-by';
import { CreateDateValue, DateValue, UpdatedDateValue } from './date';
import { DocPrimaryModeValue } from './doc-primary-mode';
import { JournalValue } from './journal';
import { NumberValue } from './number';
import { TagsValue } from './tags';
import { TextValue } from './text';
import type { PropertyValueProps } from './types';

export const DocPropertyTypes = {
  tags: {
    icon: TagIcon,
    value: TagsValue,
    name: 'com.affine.page-properties.property.tags',
    uniqueId: 'tags',
    renameable: false,
    description: 'com.affine.page-properties.property.tags.tooltips',
  },
  text: {
    icon: TextIcon,
    value: TextValue,
    name: 'com.affine.page-properties.property.text',
    description: 'com.affine.page-properties.property.text.tooltips',
  },
  number: {
    icon: NumberIcon,
    value: NumberValue,
    name: 'com.affine.page-properties.property.number',
    description: 'com.affine.page-properties.property.number.tooltips',
  },
  checkbox: {
    icon: CheckBoxCheckLinearIcon,
    value: CheckboxValue,
    name: 'com.affine.page-properties.property.checkbox',
    description: 'com.affine.page-properties.property.checkbox.tooltips',
  },
  date: {
    icon: DateTimeIcon,
    value: DateValue,
    name: 'com.affine.page-properties.property.date',
    description: 'com.affine.page-properties.property.date.tooltips',
  },
  createdBy: {
    icon: CreatedEditedIcon,
    value: CreatedByValue,
    name: 'com.affine.page-properties.property.createdBy',
    description: 'com.affine.page-properties.property.createdBy.tooltips',
  },
  updatedBy: {
    icon: CreatedEditedIcon,
    value: UpdatedByValue,
    name: 'com.affine.page-properties.property.updatedBy',
    description: 'com.affine.page-properties.property.updatedBy.tooltips',
  },
  updatedAt: {
    icon: DateTimeIcon,
    value: UpdatedDateValue,
    name: 'com.affine.page-properties.property.updatedAt',
    renameable: false,
    uniqueId: 'updatedAt',
  },
  createdAt: {
    icon: HistoryIcon,
    value: CreateDateValue,
    name: 'com.affine.page-properties.property.createdAt',
    renameable: false,
    uniqueId: 'createdAt',
  },
  docPrimaryMode: {
    icon: FileIcon,
    value: DocPrimaryModeValue,
    name: 'com.affine.page-properties.property.docPrimaryMode',
    description: 'com.affine.page-properties.property.docPrimaryMode.tooltips',
  },
  journal: {
    icon: TodayIcon,
    value: JournalValue,
    name: 'com.affine.page-properties.property.journal',
    description: 'com.affine.page-properties.property.journal.tooltips',
  },
} as Record<
  string,
  {
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    value?: React.FC<PropertyValueProps>;
    /**
     * set a unique id for property type, make the property type can only be created once.
     */
    uniqueId?: string;
    name: I18nString;
    renameable?: boolean;
    description?: I18nString;
  }
>;

export const isSupportedDocPropertyType = (type?: string): boolean => {
  return type ? type in DocPropertyTypes : false;
};
