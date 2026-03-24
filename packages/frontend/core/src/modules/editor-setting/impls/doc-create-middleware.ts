import { Service } from '@toeverything/infra';

import type { DocCreateMiddleware, DocRecord, DocsService } from '../../doc';
import type { DocCreateOptions } from '../../doc/types';
import type { AppThemeService } from '../../theme';
import type { EdgelessDefaultTheme } from '../schema';
import type { EditorSettingService } from '../services/editor-setting';
import { getUniqueNewDocDateTitle } from '../utils/date-title';

const getValueByDefaultTheme = (
  defaultTheme: EdgelessDefaultTheme,
  currentAppTheme: string
) => {
  switch (defaultTheme) {
    case 'dark':
      return 'dark';
    case 'light':
      return 'light';
    case 'specified':
      return currentAppTheme === 'dark' ? 'dark' : 'light';
    case 'auto':
      return 'system';
    default:
      return 'system';
  }
};

export class EditorSettingDocCreateMiddleware
  extends Service
  implements DocCreateMiddleware
{
  constructor(
    private readonly editorSettingService: EditorSettingService,
    private readonly appThemeService: AppThemeService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  private getCurrentDocTitles() {
    return this.docsService
      .allDocTitle$()
      .value.map(doc => doc.title)
      .filter(Boolean);
  }

  beforeCreate(docCreateOptions: DocCreateOptions): DocCreateOptions {
    // clone the docCreateOptions to avoid mutating the original object
    docCreateOptions = {
      ...docCreateOptions,
    };

    const settings = this.editorSettingService.editorSetting.settings$.value;
    const preferMode = settings.newDocDefaultMode;
    const mode = preferMode === 'ask' ? 'page' : preferMode;
    docCreateOptions.primaryMode ??= mode;

    if (
      !docCreateOptions.title?.trim() &&
      settings.autoTitleNewDocWithCurrentDate
    ) {
      docCreateOptions.title = getUniqueNewDocDateTitle({
        existingTitles: this.getCurrentDocTitles(),
        format: settings.newDocDateTitleFormat,
      });
    }

    docCreateOptions.docProps = {
      ...docCreateOptions.docProps,
      note: this.editorSettingService.editorSetting.get('affine:note'),
    };

    return docCreateOptions;
  }

  afterCreate(doc: DocRecord, _docCreateOptions: DocCreateOptions) {
    const edgelessDefaultTheme = getValueByDefaultTheme(
      this.editorSettingService.editorSetting.get('edgelessDefaultTheme'),
      this.appThemeService.appTheme.theme$.value ?? 'light'
    );
    doc.setProperty('edgelessColorTheme', edgelessDefaultTheme);
  }
}
