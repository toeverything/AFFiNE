import { Service } from '@toeverything/infra';

import type { DocCreateMiddleware, DocRecord } from '../../doc';
import type { DocCreateOptions } from '../../doc/types';
import type { AppThemeService } from '../../theme';
import type { EdgelessDefaultTheme } from '../schema';
import type { EditorSettingService } from '../services/editor-setting';

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
    private readonly appThemeService: AppThemeService
  ) {
    super();
  }
  beforeCreate(docCreateOptions: DocCreateOptions): DocCreateOptions {
    // clone the docCreateOptions to avoid mutating the original object
    docCreateOptions = {
      ...docCreateOptions,
    };

    const preferMode =
      this.editorSettingService.editorSetting.settings$.value.newDocDefaultMode;
    const mode = preferMode === 'ask' ? 'page' : preferMode;
    docCreateOptions.primaryMode ??= mode;

    docCreateOptions.docProps = {
      ...docCreateOptions.docProps,
      // A brand-new doc's own primary note still inherits every other
      // configured note default (edgeless background/border/shadow/corner
      // radius) exactly as before — but `pageBorder`/`pageBackgroundOverride`
      // (the *page-mode* display style, Story 0.6) are explicitly reset
      // here rather than inherited from the global setting: a fresh page
      // should never start out looking like it has a border around its
      // own main content, and "no override" (not a literal hardcoded
      // color) is what actually stays theme-safe in both light and dark
      // mode, since it just lets the app's own (already theme-aware) page
      // background show through instead of painting over it. The setting
      // itself still applies normally to any *other* note a user creates
      // afterward (`/note`, or "Display in Page" from edgeless) — this
      // override is specific to the one note every doc starts with.
      note: {
        ...this.editorSettingService.editorSetting.get('affine:note'),
        pageBorder: false,
        pageBackgroundOverride: undefined,
      },
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
