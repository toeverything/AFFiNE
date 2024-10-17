import type { I18nString } from '@affine/i18n';
import {
  CheckBoxCheckLinearIcon,
  CreatedEditedIcon,
  DateTimeIcon,
  FileIcon,
  NumberIcon,
  TagIcon,
  TextIcon,
} from '@blocksuite/icons/rc';

import { CheckboxValue } from './checkbox';
import { CreatedByValue, UpdatedByValue } from './created-updated-by';
import { DateValue } from './date';
import { DocPrimaryModeValue } from './doc-primary-mode';
import { NumberValue } from './number';
import { TagsValue } from './tags';
import { TextValue } from './text';
import type { PropertyValueProps } from './types';

export const DocPropertyTypes = {
  text: {
    icon: TextIcon,
    value: TextValue,
    name: 'com.affine.page-properties.property.text',
  },
  number: {
    icon: NumberIcon,
    value: NumberValue,
    name: 'com.affine.page-properties.property.number',
  },
  date: {
    icon: DateTimeIcon,
    value: DateValue,
    name: 'com.affine.page-properties.property.date',
  },
  checkbox: {
    icon: CheckBoxCheckLinearIcon,
    value: CheckboxValue,
    name: 'com.affine.page-properties.property.checkbox',
  },
  createdBy: {
    icon: CreatedEditedIcon,
    value: CreatedByValue,
    name: 'com.affine.page-properties.property.createdBy',
  },
  updatedBy: {
    icon: CreatedEditedIcon,
    value: UpdatedByValue,
    name: 'com.affine.page-properties.property.updatedBy',
  },
  tags: {
    icon: TagIcon,
    value: TagsValue,
    name: 'com.affine.page-properties.property.tags',
    uniqueId: 'tags',
    renameable: false,
  },
  docPrimaryMode: {
    icon: FileIcon,
    value: DocPrimaryModeValue,
    name: 'com.affine.page-properties.property.docPrimaryMode',
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
  }
>;

export const isSupportedDocPropertyType = (type?: string): boolean => {
  return type ? type in DocPropertyTypes : false;
};
