import {
  BulletedListIcon,
  CheckBoxIcon,
  CodeBlockIcon,
  DividerIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  NumberedListIcon,
  QuoteIcon,
  TextIcon,
} from '@blocksuite/affine-components/icons';
import type { TemplateResult } from 'lit';

/**
 * Text primitive entries used in slash menu and format bar,
 * which are also used for registering hotkeys for converting block flavours.
 */
export interface TextConversionConfig {
  flavour: string;
  type?: string;
  name: string;
  description?: string;
  hotkey: string[] | null;
  icon: TemplateResult<1>;
  searchAlias?: string[];
}

export const textConversionConfigs: TextConversionConfig[] = [
  {
    flavour: 'affine:paragraph',
    type: 'text',
    name: 'Text',
    description: 'Start typing with plain text.',
    hotkey: [`Mod-Alt-0`, `Mod-Shift-0`],
    icon: TextIcon,
  },
  {
    flavour: 'affine:paragraph',
    type: 'h1',
    name: 'Heading 1',
    description: 'Headings in the largest font.',
    hotkey: [`Mod-Alt-1`, `Mod-Shift-1`],
    icon: Heading1Icon,
  },
  {
    flavour: 'affine:paragraph',
    type: 'h2',
    name: 'Heading 2',
    description: 'Headings in the 2nd font size.',
    hotkey: [`Mod-Alt-2`, `Mod-Shift-2`],
    icon: Heading2Icon,
  },
  {
    flavour: 'affine:paragraph',
    type: 'h3',
    name: 'Heading 3',
    description: 'Headings in the 3rd font size.',
    hotkey: [`Mod-Alt-3`, `Mod-Shift-3`],
    icon: Heading3Icon,
  },
  {
    flavour: 'affine:paragraph',
    type: 'h4',
    name: 'Heading 4',
    description: 'Headings in the 4th font size.',
    hotkey: [`Mod-Alt-4`, `Mod-Shift-4`],
    icon: Heading4Icon,
  },
  {
    flavour: 'affine:paragraph',
    type: 'h5',
    name: 'Heading 5',
    description: 'Headings in the 5th font size.',
    hotkey: [`Mod-Alt-5`, `Mod-Shift-5`],
    icon: Heading5Icon,
  },
  {
    flavour: 'affine:paragraph',
    type: 'h6',
    name: 'Heading 6',
    description: 'Headings in the 6th font size.',
    hotkey: [`Mod-Alt-6`, `Mod-Shift-6`],
    icon: Heading6Icon,
  },
  {
    flavour: 'affine:list',
    type: 'bulleted',
    name: 'Bulleted List',
    description: 'Create a bulleted list.',
    hotkey: [`Mod-Alt-8`, `Mod-Shift-8`],
    icon: BulletedListIcon,
  },
  {
    flavour: 'affine:list',
    type: 'numbered',
    name: 'Numbered List',
    description: 'Create a numbered list.',
    hotkey: [`Mod-Alt-9`, `Mod-Shift-9`],
    icon: NumberedListIcon,
  },
  {
    flavour: 'affine:list',
    type: 'todo',
    name: 'To-do List',
    description: 'Add tasks to a to-do list.',
    searchAlias: ['checkbox'],
    hotkey: null,
    icon: CheckBoxIcon,
  },
  {
    flavour: 'affine:code',
    type: undefined,
    name: 'Code Block',
    description: 'Code snippet with formatting.',
    hotkey: [`Mod-Alt-c`],
    icon: CodeBlockIcon,
  },
  {
    flavour: 'affine:paragraph',
    type: 'quote',
    name: 'Quote',
    description: 'Add a blockquote for emphasis.',
    hotkey: null,
    icon: QuoteIcon,
  },
  {
    flavour: 'affine:divider',
    type: 'divider',
    name: 'Divider',
    description: 'Visually separate content.',
    hotkey: [`Mod-Alt-d`, `Mod-Shift-d`],
    icon: DividerIcon,
  },
];
