import { getOrCreateI18n } from '@affine/i18n';
import { builtInTemplates as builtInEdgelessTemplates } from '@affine/templates/edgeless';
import { localizeSnapshot } from '@affine/templates/localize-snapshot';
import { builtInTemplates as builtInStickersTemplates } from '@affine/templates/stickers';
import {
  EdgelessTemplatePanel,
  type Template,
  type TemplateManager,
} from '@blocksuite/affine/gfx/template';

import { translateEditorLabel } from '../view-extensions/editor-config/editor-labels';

type BuiltInCatalog = Pick<TemplateManager, 'list' | 'categories'> & {
  search(
    query: string,
    category: string | undefined,
    displayName: (name: string) => string
  ): Promise<unknown[]>;
};

const chineseTemplates = new WeakMap<Template, Template>();

async function localizeTemplates(templates: Template[]) {
  if (
    getOrCreateI18n().language !== 'zh-Hans' ||
    !templates.some(template => template.type === 'template')
  ) {
    return templates;
  }

  const { default: translations } =
    await import('@affine/templates/locales/zh-Hans');
  return templates.map(template => {
    if (template.type !== 'template') return template;
    const cached = chineseTemplates.get(template);
    if (cached) return cached;
    const localized = {
      ...template,
      content: localizeSnapshot(template.content, translations),
    };
    chineseTemplates.set(template, localized);
    return localized;
  });
}

function localizeCatalog(catalog: BuiltInCatalog): TemplateManager {
  return {
    categories: catalog.categories,
    list: async category => localizeTemplates(await catalog.list(category)),
    search: async query =>
      localizeTemplates(
        (await catalog.search(
          query,
          undefined,
          translateEditorLabel
        )) as Template[]
      ),
  };
}

const stickerCatalog = localizeCatalog(
  builtInStickersTemplates as BuiltInCatalog
);
const templateCatalog = localizeCatalog(
  builtInEdgelessTemplates as BuiltInCatalog
);

export function registerTemplates() {
  EdgelessTemplatePanel.templates.extend(stickerCatalog);
  EdgelessTemplatePanel.templates.extend(templateCatalog);
}
