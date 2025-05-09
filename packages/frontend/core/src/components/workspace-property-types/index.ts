import type { FilterParams } from '@affine/core/modules/collection-rules';
import type {
  WorkspacePropertyFilter,
  WorkspacePropertyType,
} from '@affine/core/modules/workspace-property';
import type { I18nString } from '@affine/i18n';
import {
  CheckBoxCheckLinearIcon,
  DateTimeIcon,
  EdgelessIcon,
  FileIcon,
  HistoryIcon,
  LongerIcon,
  MemberIcon,
  NumberIcon,
  PropertyIcon,
  TagIcon,
  TemplateIcon,
  TextIcon,
  TodayIcon,
} from '@blocksuite/icons/rc';

import type { PropertyValueProps } from '../properties/types';
import { CheckboxFilterValue, CheckboxValue } from './checkbox';
import {
  CreatedByUpdatedByFilterValue,
  CreatedByValue,
  UpdatedByValue,
} from './created-updated-by';
import {
  CreateDateValue,
  DateFilterValue,
  DateValue,
  UpdatedDateValue,
} from './date';
import {
  DocPrimaryModeFilterValue,
  DocPrimaryModeValue,
} from './doc-primary-mode';
import { EdgelessThemeValue } from './edgeless-theme';
import { JournalFilterValue, JournalValue } from './journal';
import { NumberValue } from './number';
import { PageWidthValue } from './page-width';
import { TagsFilterValue, TagsValue } from './tags';
import { TemplateValue } from './template';
import { TextFilterValue, TextValue } from './text';

const DateFilterMethod = {
  after: 'com.affine.filter.after',
  before: 'com.affine.filter.before',
  between: 'com.affine.filter.between',
  'last-3-days': 'com.affine.filter.last 3 days',
  'last-7-days': 'com.affine.filter.last 7 days',
  'last-15-days': 'com.affine.filter.last 15 days',
  'last-30-days': 'com.affine.filter.last 30 days',
  'this-week': 'com.affine.filter.this week',
  'this-month': 'com.affine.filter.this month',
  'this-quarter': 'com.affine.filter.this quarter',
  'this-year': 'com.affine.filter.this year',
} as const;

export const WorkspacePropertyTypes = {
  tags: {
    icon: TagIcon,
    value: TagsValue,
    name: 'com.affine.page-properties.property.tags',
    uniqueId: 'tags',
    renameable: false,
    description: 'com.affine.page-properties.property.tags.tooltips',
    filterMethod: {
      include: 'com.affine.filter.contains all',
      'is-not-empty': 'com.affine.filter.is not empty',
      'is-empty': 'com.affine.filter.is empty',
    },
    allowInGroupBy: true,
    allowInOrderBy: true,
    defaultFilter: { method: 'is-not-empty' },
    filterValue: TagsFilterValue,
  },
  text: {
    icon: TextIcon,
    value: TextValue,
    name: 'com.affine.page-properties.property.text',
    description: 'com.affine.page-properties.property.text.tooltips',
    filterMethod: {
      is: 'com.affine.editCollection.rules.include.is',
      'is-not': 'com.affine.editCollection.rules.include.is-not',
      'is-not-empty': 'com.affine.filter.is not empty',
      'is-empty': 'com.affine.filter.is empty',
    },
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterValue: TextFilterValue,
    defaultFilter: { method: 'is-not-empty' },
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
    filterMethod: {
      is: 'com.affine.editCollection.rules.include.is',
      'is-not': 'com.affine.editCollection.rules.include.is-not',
    },
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterValue: CheckboxFilterValue,
    defaultFilter: { method: 'is', value: 'true' },
  },
  date: {
    icon: DateTimeIcon,
    value: DateValue,
    name: 'com.affine.page-properties.property.date',
    description: 'com.affine.page-properties.property.date.tooltips',
    filterMethod: {
      'is-not-empty': 'com.affine.filter.is not empty',
      'is-empty': 'com.affine.filter.is empty',
      ...DateFilterMethod,
    },
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterValue: DateFilterValue,
    defaultFilter: { method: 'is-not-empty' },
  },
  createdBy: {
    icon: MemberIcon,
    value: CreatedByValue,
    name: 'com.affine.page-properties.property.createdBy',
    description: 'com.affine.page-properties.property.createdBy.tooltips',
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterMethod: {
      include: 'com.affine.filter.contains all',
    },
    filterValue: CreatedByUpdatedByFilterValue,
    defaultFilter: { method: 'include', value: '' },
  },
  updatedBy: {
    icon: MemberIcon,
    value: UpdatedByValue,
    name: 'com.affine.page-properties.property.updatedBy',
    description: 'com.affine.page-properties.property.updatedBy.tooltips',
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterMethod: {
      include: 'com.affine.filter.contains all',
    },
    filterValue: CreatedByUpdatedByFilterValue,
    defaultFilter: { method: 'include', value: '' },
  },
  updatedAt: {
    icon: DateTimeIcon,
    value: UpdatedDateValue,
    name: 'com.affine.page-properties.property.updatedAt',
    description: 'com.affine.page-properties.property.updatedAt.tooltips',
    renameable: false,
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterMethod: {
      ...DateFilterMethod,
    },
    filterValue: DateFilterValue,
    defaultFilter: { method: 'this-week' },
  },
  createdAt: {
    icon: HistoryIcon,
    value: CreateDateValue,
    name: 'com.affine.page-properties.property.createdAt',
    description: 'com.affine.page-properties.property.createdAt.tooltips',
    renameable: false,
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterMethod: {
      ...DateFilterMethod,
    },
    filterValue: DateFilterValue,
    defaultFilter: { method: 'this-week' },
  },
  docPrimaryMode: {
    icon: FileIcon,
    value: DocPrimaryModeValue,
    name: 'com.affine.page-properties.property.docPrimaryMode',
    description: 'com.affine.page-properties.property.docPrimaryMode.tooltips',
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterMethod: {
      is: 'com.affine.editCollection.rules.include.is',
      'is-not': 'com.affine.editCollection.rules.include.is-not',
    },
    filterValue: DocPrimaryModeFilterValue,
    defaultFilter: { method: 'is', value: 'page' },
  },
  journal: {
    icon: TodayIcon,
    value: JournalValue,
    name: 'com.affine.page-properties.property.journal',
    description: 'com.affine.page-properties.property.journal.tooltips',
    allowInGroupBy: true,
    allowInOrderBy: true,
    filterMethod: {
      is: 'com.affine.editCollection.rules.include.is',
      'is-not': 'com.affine.editCollection.rules.include.is-not',
    },
    filterValue: JournalFilterValue,
    defaultFilter: { method: 'is', value: 'true' },
  },
  edgelessTheme: {
    icon: EdgelessIcon,
    value: EdgelessThemeValue,
    name: 'com.affine.page-properties.property.edgelessTheme',
    description: 'com.affine.page-properties.property.edgelessTheme.tooltips',
  },
  pageWidth: {
    icon: LongerIcon,
    value: PageWidthValue,
    name: 'com.affine.page-properties.property.pageWidth',
    description: 'com.affine.page-properties.property.pageWidth.tooltips',
  },
  template: {
    icon: TemplateIcon,
    value: TemplateValue,
    name: 'com.affine.page-properties.property.template',
    renameable: true,
    description: 'com.affine.page-properties.property.template.tooltips',
  },
  unknown: {
    icon: PropertyIcon,
    name: 'Unknown',
    renameable: false,
  },
} as {
  [type in WorkspacePropertyType]: {
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    value?: React.FC<PropertyValueProps>;

    allowInOrderBy?: boolean;
    allowInGroupBy?: boolean;
    filterMethod?: { [key in WorkspacePropertyFilter<type>]: I18nString };
    filterValue?: React.FC<{
      filter: FilterParams;
      onChange: (filter: FilterParams) => void;
    }>;
    defaultFilter?: Omit<FilterParams, 'type' | 'key'>;
    /**
     * set a unique id for property type, make the property type can only be created once.
     */
    uniqueId?: string;
    name: I18nString;
    renameable?: boolean;
    description?: I18nString;
  };
};

export const isSupportedWorkspacePropertyType = (
  type?: string
): type is WorkspacePropertyType => {
  return type && type !== 'unknown' ? type in WorkspacePropertyTypes : false;
};
