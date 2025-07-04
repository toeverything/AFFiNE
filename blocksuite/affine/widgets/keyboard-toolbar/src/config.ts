import { addSiblingAttachmentBlocks } from '@blocksuite/affine-block-attachment';
import { insertDatabaseBlockCommand } from '@blocksuite/affine-block-database';
import { insertEmptyEmbedIframeCommand } from '@blocksuite/affine-block-embed';
import { insertImagesCommand } from '@blocksuite/affine-block-image';
import { insertLatexBlockCommand } from '@blocksuite/affine-block-latex';
import {
  canDedentListCommand,
  canIndentListCommand,
  dedentListCommand,
  indentListCommand,
} from '@blocksuite/affine-block-list';
import { updateBlockType } from '@blocksuite/affine-block-note';
import {
  canDedentParagraphCommand,
  canIndentParagraphCommand,
  dedentParagraphCommand,
  indentParagraphCommand,
} from '@blocksuite/affine-block-paragraph';
import { DefaultTool, getSurfaceBlock } from '@blocksuite/affine-block-surface';
import { insertSurfaceRefBlockCommand } from '@blocksuite/affine-block-surface-ref';
import { toggleEmbedCardCreateModal } from '@blocksuite/affine-components/embed-card-modal';
import { toast } from '@blocksuite/affine-components/toast';
import { insertInlineLatex } from '@blocksuite/affine-inline-latex';
import { toggleLink } from '@blocksuite/affine-inline-link';
import {
  formatBlockCommand,
  formatNativeCommand,
  formatTextCommand,
  getTextAttributes,
  toggleBold,
  toggleCode,
  toggleItalic,
  toggleStrike,
  toggleUnderline,
} from '@blocksuite/affine-inline-preset';
import type { FrameBlockModel } from '@blocksuite/affine-model';
import { insertContent } from '@blocksuite/affine-rich-text';
import {
  copySelectedModelsCommand,
  deleteSelectedModelsCommand,
  draftSelectedModelsCommand,
  duplicateSelectedModelsCommand,
  getBlockSelectionsCommand,
  getSelectedModelsCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import type { AffineTextStyleAttributes } from '@blocksuite/affine-shared/types';
import {
  createDefaultDoc,
  openSingleFileWith,
  type Signal,
} from '@blocksuite/affine-shared/utils';
import type { AffineLinkedDocWidget } from '@blocksuite/affine-widget-linked-doc';
import { viewPresets } from '@blocksuite/data-view/view-presets';
import { assertType } from '@blocksuite/global/utils';
import {
  AttachmentIcon,
  BoldIcon,
  BulletedListIcon,
  CheckBoxCheckLinearIcon,
  CloseIcon,
  CodeBlockIcon,
  CodeIcon,
  CollapseTabIcon,
  CopyIcon,
  DatabaseKanbanViewIcon,
  DatabaseTableViewIcon,
  DeleteIcon,
  DividerIcon,
  DuplicateIcon,
  EmbedIcon,
  FontIcon,
  FrameIcon,
  GithubIcon,
  GroupIcon,
  ImageIcon,
  ItalicIcon,
  LinkedPageIcon,
  LinkIcon,
  LoomLogoIcon,
  NewPageIcon,
  NowIcon,
  NumberedListIcon,
  PlusIcon,
  QuoteIcon,
  RedoIcon,
  RightTabIcon,
  StrikeThroughIcon,
  TeXIcon,
  TextIcon,
  TodayIcon,
  TomorrowIcon,
  UnderLineIcon,
  UndoIcon,
  YesterdayIcon,
  YoutubeDuotoneIcon,
} from '@blocksuite/icons/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  ConfigExtensionFactory,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { computed } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import type { TemplateResult } from 'lit';

import {
  FigmaDuotoneIcon,
  HeadingIcon,
  HighLightDuotoneIcon,
  TextBackgroundDuotoneIcon,
  TextColorIcon,
} from './icons.js';
import { formatDate, formatTime } from './utils.js';

export type KeyboardToolbarConfig = {
  items: KeyboardToolbarItem[];
};

export type KeyboardToolbarItem =
  | KeyboardToolbarActionItem
  | KeyboardSubToolbarConfig
  | KeyboardToolPanelConfig;

export type KeyboardIconType =
  | TemplateResult
  | ((ctx: KeyboardToolbarContext) => TemplateResult);

export type KeyboardToolbarActionItem = {
  name: string;
  icon: KeyboardIconType;
  background?: string | ((ctx: KeyboardToolbarContext) => string | undefined);
  /**
   * @default true
   * @description Whether to show the item in the toolbar.
   */
  showWhen?: (ctx: KeyboardToolbarContext) => boolean;
  /**
   * @default false
   * @description Whether to set the item as disabled status.
   */
  disableWhen?: (ctx: KeyboardToolbarContext) => boolean;
  /**
   * @description The action to be executed when the item is clicked.
   */
  action?: (ctx: KeyboardToolbarContext) => void | Promise<void>;
};

export type KeyboardSubToolbarConfig = {
  icon: KeyboardIconType;
  items: KeyboardToolbarItem[];
  /**
   * It will enter this sub-toolbar when the condition is met.
   */
  autoShow?: (ctx: KeyboardToolbarContext) => Signal<boolean>;
};

export type KeyboardToolbarContext = {
  std: BlockStdScope;
  rootComponent: BlockComponent;
  /**
   * Close tool bar, and blur the focus if blur is true, default is false
   */
  closeToolbar: (blur?: boolean) => void;
  /**
   * Close current tool panel and show virtual keyboard
   */
  closeToolPanel: () => void;
};

export type KeyboardToolPanelConfig = {
  icon: KeyboardIconType;
  activeIcon?: KeyboardIconType;
  activeBackground?: string;
  groups: (KeyboardToolPanelGroup | DynamicKeyboardToolPanelGroup)[];
};

export type KeyboardToolPanelGroup = {
  name: string;
  items: KeyboardToolbarActionItem[];
};

export type DynamicKeyboardToolPanelGroup = (
  ctx: KeyboardToolbarContext
) => KeyboardToolPanelGroup | null;

const textToolActionItems: KeyboardToolbarActionItem[] = [
  {
    name: 'Text',
    icon: TextIcon(),
    showWhen: ({ std }) =>
      std.store.schema.flavourSchemaMap.has('affine:paragraph'),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:paragraph',
        props: { type: 'text' },
      });
    },
  },
  ...([1, 2, 3, 4, 5, 6] as const).map(i => ({
    name: `Heading ${i}`,
    icon: HeadingIcon(i),
    showWhen: ({ std }: KeyboardToolbarContext) =>
      std.store.schema.flavourSchemaMap.has('affine:paragraph'),
    action: ({ std }: KeyboardToolbarContext) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:paragraph',
        props: { type: `h${i}` },
      });
    },
  })),
  {
    name: 'CodeBlock',
    showWhen: ({ std }) => std.store.schema.flavourSchemaMap.has('affine:code'),
    icon: CodeBlockIcon(),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:code',
      });
    },
  },
  {
    name: 'Quote',
    showWhen: ({ std }) =>
      std.store.schema.flavourSchemaMap.has('affine:paragraph'),
    icon: QuoteIcon(),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:paragraph',
        props: { type: 'quote' },
      });
    },
  },
  {
    name: 'Divider',
    icon: DividerIcon(),
    showWhen: ({ std }) =>
      std.store.schema.flavourSchemaMap.has('affine:divider'),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:divider',
        props: { type: 'divider' },
      });
    },
  },
  {
    name: 'Inline equation',
    icon: TeXIcon(),
    showWhen: ({ std }) =>
      std.store.schema.flavourSchemaMap.has('affine:paragraph'),
    action: ({ std }) => {
      std.command
        .chain()
        .pipe(getTextSelectionCommand)
        .pipe(insertInlineLatex)
        .run();
    },
  },
];

const listToolActionItems: KeyboardToolbarActionItem[] = [
  {
    name: 'BulletedList',
    icon: BulletedListIcon(),
    showWhen: ({ std }) => std.store.schema.flavourSchemaMap.has('affine:list'),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:list',
        props: {
          type: 'bulleted',
        },
      });
    },
  },
  {
    name: 'NumberedList',
    icon: NumberedListIcon(),
    showWhen: ({ std }) => std.store.schema.flavourSchemaMap.has('affine:list'),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:list',
        props: {
          type: 'numbered',
        },
      });
    },
  },
  {
    name: 'CheckBox',
    icon: CheckBoxCheckLinearIcon(),
    showWhen: ({ std }) => std.store.schema.flavourSchemaMap.has('affine:list'),
    action: ({ std }) => {
      std.command.exec(updateBlockType, {
        flavour: 'affine:list',
        props: {
          type: 'todo',
        },
      });
    },
  },
];

const pageToolGroup: KeyboardToolPanelGroup = {
  name: 'Page',
  items: [
    {
      name: 'NewPage',
      icon: NewPageIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:embed-linked-doc'),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(({ selectedModels }) => {
            const newDoc = createDefaultDoc(std.store.workspace);
            if (!selectedModels?.length) return;
            insertContent(std, selectedModels[0], REFERENCE_NODE, {
              reference: {
                type: 'LinkedPage',
                pageId: newDoc.id,
              },
            });
          })
          .run();
      },
    },
    {
      name: 'LinkedPage',
      icon: LinkedPageIcon(),
      showWhen: ({ std, rootComponent }) => {
        const linkedDocWidget = std.view.getWidget(
          'affine-linked-doc-widget',
          rootComponent.model.id
        );
        if (!linkedDocWidget) return false;

        return std.store.schema.flavourSchemaMap.has('affine:embed-linked-doc');
      },
      action: ({ rootComponent, closeToolPanel }) => {
        const { std } = rootComponent;

        const linkedDocWidget = std.view.getWidget(
          'affine-linked-doc-widget',
          rootComponent.model.id
        );
        if (!linkedDocWidget) return;
        assertType<AffineLinkedDocWidget>(linkedDocWidget);
        linkedDocWidget.show({
          mode: 'mobile',
          addTriggerKey: true,
        });
        closeToolPanel();
      },
    },
  ],
};

const contentMediaToolGroup: KeyboardToolPanelGroup = {
  name: 'Content & Media',
  items: [
    {
      name: 'Image',
      icon: ImageIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:image'),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertImagesCommand, { removeEmptyLine: true })
          .run();
      },
    },
    {
      name: 'Link',
      icon: LinkIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:bookmark'),
      action: async ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const parentModel = std.store.getParent(model);
        if (!parentModel) return;

        const index = parentModel.children.indexOf(model) + 1;
        await toggleEmbedCardCreateModal(
          std.host,
          'Links',
          'The added link will be displayed as a card view.',
          { mode: 'page', parentModel, index },
          ({ mode }) => {
            if (mode === 'edgeless') {
              const gfx = std.get(GfxControllerIdentifier);
              gfx.tool.setTool(DefaultTool);
            }
          }
        );
        if (model.text?.length === 0) {
          std.store.deleteBlock(model);
        }
      },
    },
    {
      name: 'Attachment',
      icon: AttachmentIcon(),
      showWhen: () => false,
      action: async ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const file = await openSingleFileWith();
        if (!file) return;

        await addSiblingAttachmentBlocks(std, [file], model);
        if (model.text?.length === 0) {
          std.store.deleteBlock(model);
        }
      },
    },
    {
      name: 'Equation',
      icon: TeXIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:latex'),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertLatexBlockCommand, {
            place: 'after',
            removeEmptyLine: true,
          })
          .run();
      },
    },
  ],
};

const embedToolGroup: KeyboardToolPanelGroup = {
  name: 'Embeds',
  items: [
    {
      name: 'Embed',
      icon: EmbedIcon({ style: `color: black` }),
      showWhen: ({ std }) => {
        return std.store.schema.flavourSchemaMap.has('affine:embed-iframe');
      },
      action: async ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertEmptyEmbedIframeCommand, {
            place: 'after',
            removeEmptyLine: true,
            linkInputPopupOptions: {
              showCloseButton: true,
              variant: 'mobile',
              telemetrySegment: 'keyboard toolbar',
            },
          })
          .run();
      },
    },
    {
      name: 'Youtube',
      icon: YoutubeDuotoneIcon({
        style: `color: white`,
      }),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:embed-youtube'),
      action: async ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const parentModel = std.store.getParent(model);
        if (!parentModel) return;

        const index = parentModel.children.indexOf(model) + 1;
        await toggleEmbedCardCreateModal(
          std.host,
          'YouTube',
          'The added YouTube video link will be displayed as an embed view.',
          { mode: 'page', parentModel, index },
          ({ mode }) => {
            if (mode === 'edgeless') {
              const gfx = std.get(GfxControllerIdentifier);
              gfx.tool.setTool(DefaultTool);
            }
          }
        );
        if (model.text?.length === 0) {
          std.store.deleteBlock(model);
        }
      },
    },
    {
      name: 'Github',
      icon: GithubIcon({ style: `color: black` }),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:embed-github'),
      action: async ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const parentModel = std.store.getParent(model);
        if (!parentModel) return;

        const index = parentModel.children.indexOf(model) + 1;
        await toggleEmbedCardCreateModal(
          std.host,
          'GitHub',
          'The added GitHub issue or pull request link will be displayed as a card view.',
          { mode: 'page', parentModel, index },
          ({ mode }) => {
            if (mode === 'edgeless') {
              const gfx = std.get(GfxControllerIdentifier);
              gfx.tool.setTool(DefaultTool);
            }
          }
        );
        if (model.text?.length === 0) {
          std.store.deleteBlock(model);
        }
      },
    },
    {
      name: 'Figma',
      icon: FigmaDuotoneIcon,
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:embed-figma'),
      action: async ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const parentModel = std.store.getParent(model);
        if (!parentModel) {
          return;
        }
        const index = parentModel.children.indexOf(model) + 1;
        await toggleEmbedCardCreateModal(
          std.host,
          'Figma',
          'The added Figma link will be displayed as an embed view.',
          { mode: 'page', parentModel, index },
          ({ mode }) => {
            if (mode === 'edgeless') {
              const gfx = std.get(GfxControllerIdentifier);
              gfx.tool.setTool(DefaultTool);
            }
          }
        );
        if (model.text?.length === 0) {
          std.store.deleteBlock(model);
        }
      },
    },
    {
      name: 'Loom',
      icon: LoomLogoIcon({ style: `color: #625DF5` }),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:embed-loom'),
      action: async ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const parentModel = std.store.getParent(model);
        if (!parentModel) return;

        const index = parentModel.children.indexOf(model) + 1;
        await toggleEmbedCardCreateModal(
          std.host,
          'Loom',
          'The added Loom video link will be displayed as an embed view.',
          { mode: 'page', parentModel, index },
          ({ mode }) => {
            if (mode === 'edgeless') {
              const gfx = std.get(GfxControllerIdentifier);
              gfx.tool.setTool(DefaultTool);
            }
          }
        );
        if (model.text?.length === 0) {
          std.store.deleteBlock(model);
        }
      },
    },
    {
      name: 'Equation',
      icon: TeXIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:latex'),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertLatexBlockCommand, {
            place: 'after',
            removeEmptyLine: true,
          })
          .run();
      },
    },
  ],
};

const documentGroupFrameToolGroup: DynamicKeyboardToolPanelGroup = ({
  std,
}) => {
  const { store } = std;

  const frameModels = store
    .getBlocksByFlavour('affine:frame')
    .map(block => block.model) as FrameBlockModel[];

  const frameItems = frameModels.map<KeyboardToolbarActionItem>(frameModel => ({
    name: 'Frame: ' + frameModel.props.title.toString(),
    icon: FrameIcon(),
    action: ({ std }) => {
      std.command
        .chain()
        .pipe(getSelectedModelsCommand)
        .pipe(insertSurfaceRefBlockCommand, {
          reference: frameModel.id,
          place: 'after',
          removeEmptyLine: true,
        })
        .run();
    },
  }));

  const surfaceModel = getSurfaceBlock(store);

  const groupElements = surfaceModel
    ? surfaceModel.getElementsByType('group')
    : [];

  const groupItems = groupElements.map<KeyboardToolbarActionItem>(group => ({
    name: 'Group: ' + group.title.toString(),
    icon: GroupIcon(),
    action: ({ std }) => {
      std.command
        .chain()
        .pipe(getSelectedModelsCommand)
        .pipe(insertSurfaceRefBlockCommand, {
          reference: group.id,
          place: 'after',
          removeEmptyLine: true,
        })
        .run();
    },
  }));

  const items = [...frameItems, ...groupItems];

  if (items.length === 0) return null;

  return {
    name: 'Document Group&Frame',
    items,
  };
};

const dateToolGroup: KeyboardToolPanelGroup = {
  name: 'Date',
  items: [
    {
      name: 'Today',
      icon: TodayIcon(),
      action: ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        insertContent(std, model, formatDate(new Date()));
      },
    },
    {
      name: 'Tomorrow',
      icon: TomorrowIcon(),
      action: ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        insertContent(std, model, formatDate(tomorrow));
      },
    },
    {
      name: 'Yesterday',
      icon: YesterdayIcon(),
      action: ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        insertContent(std, model, formatDate(yesterday));
      },
    },
    {
      name: 'Now',
      icon: NowIcon(),
      action: ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        insertContent(std, model, formatTime(new Date()));
      },
    },
  ],
};

const databaseToolGroup: KeyboardToolPanelGroup = {
  name: 'Database',
  items: [
    {
      name: 'Table view',
      icon: DatabaseTableViewIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:database'),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertDatabaseBlockCommand, {
            viewType: viewPresets.tableViewMeta.type,
            place: 'after',
            removeEmptyLine: true,
          })
          .run();
      },
    },
    {
      name: 'Kanban view',
      icon: DatabaseKanbanViewIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:database'),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertDatabaseBlockCommand, {
            viewType: viewPresets.kanbanViewMeta.type,
            place: 'after',
            removeEmptyLine: true,
          })
          .run();
      },
    },
  ],
};

const moreToolPanel: KeyboardToolPanelConfig = {
  icon: PlusIcon(),
  activeIcon: CloseIcon({
    style: `color: ${cssVarV2('icon/activated')}`,
  }),
  activeBackground: cssVarV2('edgeless/selection/selectionMarqueeBackground'),
  groups: [
    { name: 'Basic', items: textToolActionItems },
    { name: 'List', items: listToolActionItems },
    pageToolGroup,
    contentMediaToolGroup,
    embedToolGroup,
    documentGroupFrameToolGroup,
    dateToolGroup,
    databaseToolGroup,
  ],
};

const textToolPanel: KeyboardToolPanelConfig = {
  icon: TextIcon(),
  groups: [
    {
      name: 'Turn into',
      items: textToolActionItems,
    },
  ],
};

const textStyleToolItems: KeyboardToolbarItem[] = [
  {
    name: 'Bold',
    icon: BoldIcon(),
    background: ({ std }) => {
      const [_, { textAttributes }] = std.command.exec(getTextAttributes);
      return textAttributes?.bold ? '#00000012' : '';
    },
    action: ({ std }) => {
      std.command.exec(toggleBold);
    },
  },
  {
    name: 'Italic',
    icon: ItalicIcon(),
    background: ({ std }) => {
      const [_, { textAttributes }] = std.command.exec(getTextAttributes);
      return textAttributes?.italic ? '#00000012' : '';
    },
    action: ({ std }) => {
      std.command.exec(toggleItalic);
    },
  },
  {
    name: 'UnderLine',
    icon: UnderLineIcon(),
    background: ({ std }) => {
      const [_, { textAttributes }] = std.command.exec(getTextAttributes);
      return textAttributes?.underline ? '#00000012' : '';
    },
    action: ({ std }) => {
      std.command.exec(toggleUnderline);
    },
  },
  {
    name: 'StrikeThrough',
    icon: StrikeThroughIcon(),
    background: ({ std }) => {
      const [_, { textAttributes }] = std.command.exec(getTextAttributes);
      return textAttributes?.strike ? '#00000012' : '';
    },
    action: ({ std }) => {
      std.command.exec(toggleStrike);
    },
  },
  {
    name: 'Code',
    icon: CodeIcon(),
    background: ({ std }) => {
      const [_, { textAttributes }] = std.command.exec(getTextAttributes);
      return textAttributes?.code ? '#00000012' : '';
    },
    action: ({ std }) => {
      std.command.exec(toggleCode);
    },
  },
  {
    name: 'Link',
    icon: LinkIcon(),
    background: ({ std }) => {
      const [_, { textAttributes }] = std.command.exec(getTextAttributes);
      return textAttributes?.link ? '#00000012' : '';
    },
    action: ({ std }) => {
      std.command.exec(toggleLink);
    },
  },
];

const highlightToolPanel: KeyboardToolPanelConfig = {
  icon: ({ std }) => {
    const [_, { textAttributes }] = std.command.exec(getTextAttributes);
    if (textAttributes?.color) {
      return HighLightDuotoneIcon(textAttributes.color);
    } else {
      return HighLightDuotoneIcon(cssVarV2('icon/primary'));
    }
  },
  groups: [
    {
      name: 'Color',
      items: [
        {
          name: 'Default Color',
          icon: TextColorIcon(cssVarV2('text/highlight/fg/orange')),
        },
        ...(
          [
            'red',
            'orange',
            'yellow',
            'green',
            'teal',
            'blue',
            'purple',
            'grey',
          ] as const
        ).map<KeyboardToolbarActionItem>(color => ({
          name: color.charAt(0).toUpperCase() + color.slice(1),
          icon: TextColorIcon(cssVarV2(`text/highlight/fg/${color}`)),
          action: ({ std }) => {
            const payload = {
              styles: {
                color: cssVarV2(`text/highlight/fg/${color}`),
              } satisfies AffineTextStyleAttributes,
            };
            std.command
              .chain()
              .try(chain => [
                chain
                  .pipe(getTextSelectionCommand)
                  .pipe(formatTextCommand, payload),
                chain
                  .pipe(getBlockSelectionsCommand)
                  .pipe(formatBlockCommand, payload),
                chain.pipe(formatNativeCommand, payload),
              ])
              .run();
          },
        })),
      ],
    },
    {
      name: 'Background',
      items: [
        {
          name: 'Default Color',
          icon: TextBackgroundDuotoneIcon(cssVarV2('text/highlight/bg/orange')),
        },
        ...(
          [
            'red',
            'orange',
            'yellow',
            'green',
            'teal',
            'blue',
            'purple',
            'grey',
          ] as const
        ).map<KeyboardToolbarActionItem>(color => ({
          name: color.charAt(0).toUpperCase() + color.slice(1),
          icon: TextBackgroundDuotoneIcon(
            cssVarV2(`text/highlight/bg/${color}`)
          ),
          action: ({ std }) => {
            const payload = {
              styles: {
                background: cssVarV2(`text/highlight/bg/${color}`),
              } satisfies AffineTextStyleAttributes,
            };
            std.command
              .chain()
              .try(chain => [
                chain
                  .pipe(getTextSelectionCommand)
                  .pipe(formatTextCommand, payload),
                chain
                  .pipe(getBlockSelectionsCommand)
                  .pipe(formatBlockCommand, payload),
                chain.pipe(formatNativeCommand, payload),
              ])
              .run();
          },
        })),
      ],
    },
  ],
};

const textSubToolbarConfig: KeyboardSubToolbarConfig = {
  icon: FontIcon(),
  items: [
    textToolPanel,
    ...textStyleToolItems,
    {
      name: 'InlineTex',
      icon: TeXIcon(),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getTextSelectionCommand)
          .pipe(insertInlineLatex)
          .run();
      },
    },
    highlightToolPanel,
  ],
  autoShow: ({ std }) => {
    return computed(() => {
      const [_, { currentTextSelection: selection }] = std.command.exec(
        getTextSelectionCommand
      );
      return selection ? !selection.isCollapsed() : false;
    });
  },
};

export const defaultKeyboardToolbarConfig: KeyboardToolbarConfig = {
  items: [
    moreToolPanel,
    // TODO(@L-Sun): add ai function in AFFiNE side
    // { icon: AiIcon(iconStyle) },
    textSubToolbarConfig,
    {
      name: 'Image',
      icon: ImageIcon(),
      showWhen: ({ std }) =>
        std.store.schema.flavourSchemaMap.has('affine:image'),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(insertImagesCommand, { removeEmptyLine: true })
          .run();
      },
    },
    {
      name: 'Attachment',
      icon: AttachmentIcon(),
      showWhen: () => false,
      action: async ({ std }) => {
        const [_, { selectedModels }] = std.command.exec(
          getSelectedModelsCommand
        );
        const model = selectedModels?.[0];
        if (!model) return;

        const file = await openSingleFileWith();
        if (!file) return;

        await addSiblingAttachmentBlocks(std, [file], model);
        if (model.text?.length === 0) {
          std.store.deleteBlock(model);
        }
      },
    },
    {
      name: 'Undo',
      icon: UndoIcon(),
      disableWhen: ({ std }) => !std.store.canUndo,
      action: ({ std }) => {
        std.store.undo();
      },
    },
    {
      name: 'Redo',
      icon: RedoIcon(),
      disableWhen: ({ std }) => !std.store.canRedo,
      action: ({ std }) => {
        std.store.redo();
      },
    },
    {
      name: 'RightTab',
      icon: RightTabIcon(),
      disableWhen: ({ std }) => {
        const [success] = std.command
          .chain()
          .tryAll(chain => [
            chain.pipe(canIndentParagraphCommand),
            chain.pipe(canIndentListCommand),
          ])
          .run();
        return !success;
      },
      action: ({ std }) => {
        std.command
          .chain()
          .tryAll(chain => [
            chain.pipe(canIndentParagraphCommand).pipe(indentParagraphCommand),
            chain.pipe(canIndentListCommand).pipe(indentListCommand),
          ])
          .run();
      },
    },
    ...listToolActionItems,
    ...textToolActionItems.filter(({ name }) => name === 'Divider'),
    {
      name: 'CollapseTab',
      icon: CollapseTabIcon(),
      disableWhen: ({ std }) => {
        const [success] = std.command
          .chain()
          .tryAll(chain => [
            chain.pipe(canDedentParagraphCommand),
            chain.pipe(canDedentListCommand),
          ])
          .run();
        return !success;
      },
      action: ({ std }) => {
        std.command
          .chain()
          .tryAll(chain => [
            chain.pipe(canDedentParagraphCommand).pipe(dedentParagraphCommand),
            chain.pipe(canDedentListCommand).pipe(dedentListCommand),
          ])
          .run();
      },
    },
    {
      name: 'Copy',
      icon: CopyIcon(),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .with({
            onCopy: () => {
              toast(std.host, 'Copied to clipboard');
            },
          })
          .pipe(draftSelectedModelsCommand)
          .pipe(copySelectedModelsCommand)
          .run();
      },
    },
    {
      name: 'Duplicate',
      icon: DuplicateIcon(),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(duplicateSelectedModelsCommand)
          .run();
      },
    },
    {
      name: 'Delete',
      icon: DeleteIcon(),
      action: ({ std }) => {
        std.command
          .chain()
          .pipe(getSelectedModelsCommand)
          .pipe(deleteSelectedModelsCommand)
          .run();
      },
    },
  ],
};

export const KeyboardToolbarConfigExtension = ConfigExtensionFactory<
  Partial<KeyboardToolbarConfig>
>('affine:keyboard-toolbar');
