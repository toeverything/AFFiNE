import { I18n } from '@affine/i18n';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import type { Container, ServiceProvider } from '@blocksuite/affine/global/di';
import {
  type SlashMenuConfig,
  SlashMenuConfigIdentifier,
  type SlashMenuContext,
  type SlashMenuItem,
} from '@blocksuite/affine/widgets/slash-menu';

/**
 * Translation map from English names to i18n keys.
 * NOTE: This map must be kept in sync with BlockSuite slash menu items.
 * Update when adding/removing menu items from BlockSuite.
 */
const nameKeyMap: Record<string, string> = {
  Text: 'com.affine.editor.slash-menu.text',
  'Heading 1': 'com.affine.editor.slash-menu.heading1',
  'Heading 2': 'com.affine.editor.slash-menu.heading2',
  'Heading 3': 'com.affine.editor.slash-menu.heading3',
  'Heading 4': 'com.affine.editor.slash-menu.heading4',
  'Heading 5': 'com.affine.editor.slash-menu.heading5',
  'Heading 6': 'com.affine.editor.slash-menu.heading6',
  'Bulleted List': 'com.affine.editor.slash-menu.bulleted-list',
  'Numbered List': 'com.affine.editor.slash-menu.numbered-list',
  'To-do List': 'com.affine.editor.slash-menu.todo-list',
  'Code Block': 'com.affine.editor.slash-menu.code-block',
  Quote: 'com.affine.editor.slash-menu.quote',
  Divider: 'com.affine.editor.slash-menu.divider',
  'Other Headings': 'com.affine.editor.slash-menu.other-headings',
  'Inline equation': 'com.affine.editor.slash-menu.inline-equation',
  Equation: 'com.affine.editor.slash-menu.equation',
  Callout: 'com.affine.editor.slash-menu.callout',
  'Ask AI': 'com.affine.ai.ask-ai',
  'Fix spelling from above': 'com.affine.ai.fix-spelling-from-above',
  'Fix grammar from above': 'com.affine.ai.fix-grammar-from-above',
  'Continue writing': 'com.affine.ai.continue-writing',
  Summarize: 'com.affine.ai.summarize',
  'Action with above': 'com.affine.ai.action-with-above',
  'Translate to': 'com.affine.ai.translate-to',
  'Change tone to': 'com.affine.ai.change-tone-to',
  'Improve writing': 'com.affine.ai.improve-writing',
  'Make it longer': 'com.affine.ai.make-it-longer',
  'Make it shorter': 'com.affine.ai.make-it-shorter',
  'Generate outline': 'com.affine.ai.generate-outline',
  'Find actions': 'com.affine.ai.find-actions',
};

const descKeyMap: Record<string, string> = {
  'Start typing with plain text.':
    'com.affine.editor.slash-menu.text.description',
  'Headings in the largest font.':
    'com.affine.editor.slash-menu.heading1.description',
  'Headings in the 2nd font size.':
    'com.affine.editor.slash-menu.heading2.description',
  'Headings in the 3rd font size.':
    'com.affine.editor.slash-menu.heading3.description',
  'Headings in the 4th font size.':
    'com.affine.editor.slash-menu.heading4.description',
  'Headings in the 5th font size.':
    'com.affine.editor.slash-menu.heading5.description',
  'Headings in the 6th font size.':
    'com.affine.editor.slash-menu.heading6.description',
  'Create a bulleted list.':
    'com.affine.editor.slash-menu.bulleted-list.description',
  'Create a numbered list.':
    'com.affine.editor.slash-menu.numbered-list.description',
  'Add tasks to a to-do list.':
    'com.affine.editor.slash-menu.todo-list.description',
  'Code snippet with formatting.':
    'com.affine.editor.slash-menu.code-block.description',
  'Add a blockquote for emphasis.':
    'com.affine.editor.slash-menu.quote.description',
  'Visually separate content.':
    'com.affine.editor.slash-menu.divider.description',
  'Create a inline equation.':
    'com.affine.editor.slash-menu.inline-equation.description',
  'Create a equation block.':
    'com.affine.editor.slash-menu.equation.description',
  'Let your words stand out.':
    'com.affine.editor.slash-menu.callout.description',
};

function translateItem(item: SlashMenuItem): SlashMenuItem {
  const nameKey = nameKeyMap[item.name];
  const translated = {
    ...item,
    name: nameKey ? I18n[nameKey]() : item.name,
  };

  if (
    'description' in translated &&
    typeof translated.description === 'string'
  ) {
    const descKey = descKeyMap[translated.description];
    if (descKey) {
      translated.description = I18n[descKey]();
    }
  }

  if ('subMenu' in translated && Array.isArray(translated.subMenu)) {
    translated.subMenu = translated.subMenu.map(translateItem);
  }

  return translated;
}

function translateConfig(config: SlashMenuConfig): SlashMenuConfig {
  if (typeof config.items === 'function') {
    const prevItems = config.items;
    return {
      ...config,
      items: (ctx: SlashMenuContext) => prevItems(ctx).map(translateItem),
    };
  }
  return {
    ...config,
    items: config.items.map(translateItem),
  };
}

function overrideConfig(di: Container, id: string) {
  const identifier = SlashMenuConfigIdentifier(id);
  const prev = di.getFactory(identifier);
  if (prev) {
    di.override(identifier, (provider: ServiceProvider) =>
      translateConfig(prev(provider) as SlashMenuConfig)
    );
  } else if (process.env.NODE_ENV === 'development') {
    console.warn('[SlashMenuI18n] Config not found for id: ' + id);
  }
}

/**
 * View extension provider that intercepts slash menu configs and translates
 * item names/descriptions using AFFiNE's i18n system.
 */
export class SlashMenuI18nExtension extends ViewExtensionProvider {
  name = 'affine-slash-menu-i18n';

  setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register({
      setup: (di: Container) => {
        overrideConfig(di, 'affine:note');
        overrideConfig(di, 'default');
        overrideConfig(di, 'ai');
      },
    });
  }
}
