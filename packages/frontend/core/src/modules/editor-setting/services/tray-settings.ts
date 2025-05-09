import type {
  MenubarStateKey,
  MenubarStateSchema,
} from '@affine/electron/main/shared-state-schema';
import { LiveData, Service } from '@toeverything/infra';

import type { GlobalStateService } from '../../storage';

const MENUBAR_SETTING_KEY: typeof MenubarStateKey = 'menubarState';

export class TraySettingService extends Service {
  constructor(private readonly globalStateService: GlobalStateService) {
    super();
  }

  setting$ = LiveData.from(
    this.globalStateService.globalState.watch<MenubarStateSchema>(
      MENUBAR_SETTING_KEY
    ),
    null
  ).map(v => v ?? { enabled: true });

  setEnabled(enabled: boolean) {
    this.globalStateService.globalState.set(MENUBAR_SETTING_KEY, {
      enabled,
    });
  }
}
