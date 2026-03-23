import { Service } from '@toeverything/infra';
import { Array as YArray, Map as YMap } from 'yjs';

import type { DocCreateMiddleware, DocRecord } from '../../doc';
import type { DocCreateOptions } from '../../doc/types';
import type { AppThemeService } from '../../theme';
import type { WorkspaceService } from '../../workspace';
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
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  private getCurrentDocTitles() {
    const pages = this.workspaceService.workspace.rootYDoc
      .getMap('meta')
      .get('pages');

    if (!(pages instanceof YArray)) {
      return [];
    }

    return pages
      .map(page => {
        if (!(page instanceof YMap)) {
          return '';
        }
        return (page.get('title') ?? '') as string;
      })
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
