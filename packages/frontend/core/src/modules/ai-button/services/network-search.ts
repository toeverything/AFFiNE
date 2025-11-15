import {
  createSignalFromObservable,
  type Signal,
} from '@blocksuite/affine/shared/utils';
import { LiveData, Service } from '@toeverything/infra';

import type { FeatureFlagService } from '../../feature-flag';
import type { GlobalStateService } from '../../storage';

const AI_NETWORK_SEARCH_KEY = 'AINetworkSearch';

export class AINetworkSearchService extends Service {
  constructor(
    private readonly globalStateService: GlobalStateService,
    private readonly featureFlagService: FeatureFlagService
  ) {
    super();

    const { signal: enabled, cleanup: enabledCleanup } =
      createSignalFromObservable<boolean | undefined>(
        this._enabled$,
        undefined
      );
    this.enabled = enabled;
    this.disposables.push(enabledCleanup);

    const { signal: visible, cleanup: visibleCleanup } =
      createSignalFromObservable<boolean | undefined>(
        this._visible$,
        undefined
      );
    this.visible = visible;
    this.disposables.push(visibleCleanup);
  }

  visible: Signal<boolean | undefined>;

  enabled: Signal<boolean | undefined>;

  private readonly _visible$ =
    this.featureFlagService.flags.enable_ai_network_search.$;

  private readonly _enabled$ = LiveData.from(
    this.globalStateService.globalState.watch<boolean>(AI_NETWORK_SEARCH_KEY),
    undefined
  );

  setEnabled = (enabled: boolean) => {
    this.globalStateService.globalState.set(AI_NETWORK_SEARCH_KEY, enabled);
  };
}
