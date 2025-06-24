import type {
  SpellCheckStateKey,
  SpellCheckStateSchema,
} from '@affine/electron-api';
import type { Language } from '@affine/i18n';
import { LiveData, Service } from '@toeverything/infra';

import type { DesktopApiService } from '../../desktop-api';
import type { I18n } from '../../i18n';
import type { GlobalStateService } from '../../storage';

const SPELL_CHECK_SETTING_KEY: typeof SpellCheckStateKey = 'spellCheckState';

export class SpellCheckSettingService extends Service {
  constructor(
    private readonly globalStateService: GlobalStateService,
    private readonly i18n: I18n,
    private readonly desktopApiService: DesktopApiService
  ) {
    super();

    // this will be called even during initialization
    this.i18n.i18next.on('languageChanged', (language: Language) => {
      this.desktopApiService.handler.ui
        .onLanguageChange(language)
        .catch(err => {
          console.error(err);
        });
    });
  }

  enabled$ = LiveData.from(
    this.globalStateService.globalState.watch<
      SpellCheckStateSchema | undefined
    >(SPELL_CHECK_SETTING_KEY),
    { enabled: false }
  );

  setEnabled(enabled: boolean) {
    this.globalStateService.globalState.set(SPELL_CHECK_SETTING_KEY, {
      enabled,
    });
  }
}
