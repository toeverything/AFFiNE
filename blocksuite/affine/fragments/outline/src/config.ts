import type { ParagraphBlockModel } from '@blocksuite/affine-model';
import {
  AttachmentIcon,
  BlockIcon,
  BookmarkIcon,
  BulletedListIcon,
  CheckBoxCheckLinearIcon,
  CodeBlockIcon,
  DatabaseKanbanViewIcon,
  DatabaseTableViewIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  ImageIcon,
  NumberedListIcon,
  QuoteIcon,
  TextIcon,
} from '@blocksuite/icons/lit';
import type { EditorHost } from '@blocksuite/std';
import { createContext } from '@lit/context';
import type { Signal } from '@preact/signals-core';
import type { TemplateResult } from 'lit';

const _16px = { width: '16px', height: '16px' };

const paragraphIconMap: Record<
  ParagraphBlockModel['props']['type'],
  TemplateResult<1>
> = {
  quote: QuoteIcon(_16px),
  text: TextIcon(_16px),
  h1: Heading1Icon(_16px),
  h2: Heading2Icon(_16px),
  h3: Heading3Icon(_16px),
  h4: Heading4Icon(_16px),
  h5: Heading5Icon(_16px),
  h6: Heading6Icon(_16px),
};

export const previewIconMap = {
  ...paragraphIconMap,
  code: CodeBlockIcon(_16px),
  numbered: NumberedListIcon(_16px),
  bulleted: BulletedListIcon(_16px),
  todo: CheckBoxCheckLinearIcon(_16px),
  toggle: BlockIcon(_16px),
  bookmark: BookmarkIcon(_16px),
  image: ImageIcon(_16px),
  table: DatabaseTableViewIcon(_16px),
  kanban: DatabaseKanbanViewIcon(_16px),
  attachment: AttachmentIcon(_16px),
};

const paragraphPlaceholderMap: Record<
  ParagraphBlockModel['props']['type'],
  string
> = {
  quote: 'Quote',
  text: 'Text Block',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
};

export const placeholderMap = {
  code: 'Code Block',
  bulleted: 'Bulleted List',
  numbered: 'Numbered List',
  toggle: 'Toggle List',
  todo: 'Todo',
  bookmark: 'Bookmark',
  image: 'Image',
  database: 'Database',
  attachment: 'Attachment',
  ...paragraphPlaceholderMap,
};

export const headingKeys = new Set(
  Object.keys(paragraphPlaceholderMap).filter(key => key.startsWith('h'))
);

export const outlineSettingsKey = 'outlinePanelSettings';

export type TocContext = {
  editor$: Signal<EditorHost>;
  enableSorting$: Signal<boolean>;
  showIcons$: Signal<boolean>;
  fitPadding$: Signal<number[]>;
};

export const tocContext = createContext<TocContext>('tocContext');
